mod acp;
mod resume;
mod storage;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager};
#[derive(Clone, Serialize, Deserialize)]
struct Provider {
    id: String,
    name: String,
    executable: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    cwd: String,
}
struct AppState {
    clients: tokio::sync::Mutex<HashMap<String, Arc<acp::Client>>>,
    db: Mutex<Connection>,
    connecting: Mutex<HashSet<String>>,
    deleted: Mutex<HashSet<String>>,
}
fn event(app: &tauri::AppHandle, id: &str, kind: &str, data: Value) {
    let at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let state = app.state::<AppState>();
    let mut payload = json!({"session":id,"kind":kind,"data":data,"at":at});
    // The database lock covers only persistence. Sequence numbers let the UI
    // merge concurrent emissions in database order without holding it during IPC.
    let saved = {
        let db = state.db.lock().map_err(|e| e.to_string());
        match db {
            Ok(db) => {
                // Late notifications from a stopped/deleted process must not
                // recreate activity rows after deletion commits.
                if state
                    .deleted
                    .lock()
                    .map(|ids| ids.contains(id))
                    .unwrap_or(true)
                {
                    return;
                }
                storage::append(&db, id, kind, &data, at).map_err(|e| e.to_string())
            }
            Err(e) => Err(e),
        }
    };
    match saved {
        Ok(seq) => payload["seq"] = json!(seq),
        Err(e) => {
            let _ = app.emit(
                "history-error",
                format!("Unable to save conversation activity: {e}"),
            );
        }
    }
    let _ = app.emit("agent-event", payload);
}
#[tauri::command]
fn startup_directory() -> Result<String, String> {
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    // Tauri's development runner starts in src-tauri. Use the project root there.
    let project = if cwd.file_name().is_some_and(|name| name == "src-tauri")
        && cwd.join("tauri.conf.json").is_file()
    {
        cwd.parent().unwrap_or(&cwd)
    } else {
        &cwd
    };
    Ok(project.to_string_lossy().into_owned())
}
#[tauri::command]
async fn new_session(app: tauri::AppHandle, mut provider: Provider) -> Result<String, String> {
    let cwd = std::path::Path::new(&provider.cwd);
    if !cwd.is_absolute() || !cwd.is_dir() {
        return Err("Choose an existing absolute project directory in Provider settings".into());
    }
    provider.cwd = cwd
        .canonicalize()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned();
    let id = uuid::Uuid::new_v4().to_string();
    let client = acp::Client::start(app.clone(), id.clone(), &provider).await?;
    let init=client.request("initialize",json!({"protocolVersion":1,"clientCapabilities":{},"clientInfo":{"name":"agent-desk","version":"0.1.0"}})).await?;
    if init["protocolVersion"] != 1 {
        return Err("Provider did not negotiate ACP v1".into());
    }
    let session = client
        .request("session/new", json!({"cwd":provider.cwd,"mcpServers":[]}))
        .await?;
    let remote = session["sessionId"]
        .as_str()
        .ok_or("Missing sessionId")?
        .to_string();
    *client.remote.lock().await = remote;
    let state = app.state::<AppState>();
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .execute(
            "INSERT INTO sessions(id,provider,cwd,remote_id,provider_id) VALUES(?1,?2,?3,?4,?5)",
            params![
                id,
                provider.name,
                provider.cwd,
                session["sessionId"].as_str(),
                provider.id
            ],
        )
        .map_err(|e| e.to_string())?;
    state.clients.lock().await.insert(id.clone(), client);
    event(&app, &id, "identity", init);
    Ok(id)
}
// Reserve a local session while reconnecting, without serializing other chats.
struct Connecting<'a> {
    state: &'a AppState,
    id: String,
}
impl Drop for Connecting<'_> {
    fn drop(&mut self) {
        if let Ok(mut ids) = self.state.connecting.lock() {
            ids.remove(&self.id);
        }
    }
}
#[tauri::command]
async fn resume_session(
    app: tauri::AppHandle,
    id: String,
    mut provider: Provider,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let mut ids = state.connecting.lock().map_err(|e| e.to_string())?;
        if !ids.insert(id.clone()) {
            return Err("This conversation is already reconnecting".into());
        }
    }
    let _reservation = Connecting {
        state: &state,
        id: id.clone(),
    };
    let saved = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        storage::connection(&db, &id).map_err(|e| e.to_string())?
    };
    let remote=saved.remote_id.ok_or("This older conversation has no saved provider session ID. It remains readable, but cannot be continued. New chats now save the information needed to resume.")?;
    if let Some(provider_id) = saved.provider_id {
        if provider.id != provider_id {
            return Err(
                "Use this conversation's original provider configuration to continue".into(),
            );
        }
    } else if provider.name != saved.provider {
        return Err("Use this conversation's original provider to continue".into());
    }
    {
        let mut clients = state.clients.lock().await;
        if clients.get(&id).is_some_and(|c| c.is_connected()) {
            return Ok(());
        }
        if let Some(old) = clients.remove(&id) {
            old.shutdown();
        }
    }
    // Always use the saved conversation's original root, even if provider defaults changed.
    provider.cwd = saved.cwd;
    if !std::path::Path::new(&provider.cwd).is_absolute()
        || !std::path::Path::new(&provider.cwd).is_dir()
    {
        return Err("The conversation's original project directory is unavailable".into());
    }
    let client = acp::Client::start(app.clone(), id.clone(), &provider).await?;
    let init=client.request("initialize",json!({"protocolVersion":1,"clientCapabilities":{},"clientInfo":{"name":"agent-desk","version":"0.1.0"}})).await?;
    if init["protocolVersion"] != 1 {
        return Err("Provider did not negotiate ACP v1".into());
    }
    client
        .restore(&init, &remote, &provider.cwd)
        .await
        .map_err(|e| format!("Could not continue this conversation: {e}"))?;
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .execute(
            "UPDATE sessions SET provider_id=?1 WHERE id=?2",
            params![provider.id, id],
        )
        .map_err(|e| e.to_string())?;
    state.clients.lock().await.insert(id.clone(), client);
    event(&app, &id, "connection_started", init);
    Ok(())
}
#[tauri::command]
async fn prompt(app: tauri::AppHandle, id: String, text: String) -> Result<(), String> {
    let client = app
        .state::<AppState>()
        .clients
        .lock()
        .await
        .get(&id)
        .cloned()
        .ok_or("Session is historical; start a fresh session")?;
    let _busy = client
        .turn
        .try_lock()
        .map_err(|_| "A response is already running")?;
    event(&app, &id, "user", json!(text));
    let remote = client.remote.lock().await.clone();
    let result = client
        .request(
            "session/prompt",
            json!({"sessionId":remote,"prompt":[{"type":"text","text":text}]}),
        )
        .await;
    // Closing/reconnecting may replace this process while a prompt unwinds.
    if !app
        .state::<AppState>()
        .clients
        .lock()
        .await
        .get(&id)
        .is_some_and(|current| Arc::ptr_eq(current, &client))
    {
        return result.map(|_| ());
    }
    if let Err(e) = &result {
        event(&app, &id, "error", json!(e));
    }
    event(&app, &id, "done", json!(null));
    result.map(|_| ())
}
#[tauri::command]
async fn permission(
    app: tauri::AppHandle,
    id: String,
    request: Value,
    option: Option<String>,
) -> Result<(), String> {
    let client = app
        .state::<AppState>()
        .clients
        .lock()
        .await
        .get(&id)
        .cloned()
        .ok_or("Session closed")?;
    let decision = client.respond_permission(request, option).await?;
    event(&app, &id, "permission_resolved", decision);
    Ok(())
}
#[tauri::command]
async fn cancel(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let client = app
        .state::<AppState>()
        .clients
        .lock()
        .await
        .get(&id)
        .cloned()
        .ok_or("Session closed")?;
    let remote = client.remote.lock().await.clone();
    client
        .send(json!({"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId":remote}}))
        .await
}
#[tauri::command]
async fn close_session(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state
        .connecting
        .lock()
        .map_err(|e| e.to_string())?
        .contains(&id)
    {
        return Err("Wait for this conversation to reconnect before closing it".into());
    }
    if let Some(client) = state.clients.lock().await.remove(&id) {
        client.shutdown();
    }
    event(&app, &id, "session_closed", Value::Null);
    Ok(())
}
#[tauri::command]
fn history(app: tauri::AppHandle) -> Result<Value, String> {
    let state = app.state::<AppState>();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    storage::history(&db).map_err(|e| e.to_string())
}
#[tauri::command]
fn rename_session(app: tauri::AppHandle, id: String, title: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    storage::rename(&db, &id, &title)
}
#[tauri::command]
async fn delete_session(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let mut ids = state.connecting.lock().map_err(|e| e.to_string())?;
        if !ids.insert(id.clone()) {
            return Err("Wait for this conversation to finish reconnecting".into());
        }
    }
    let _reservation = Connecting {
        state: &state,
        id: id.clone(),
    };
    let mut clients = state.clients.lock().await;
    let client = clients.get(&id).cloned();
    let _idle = if let Some(client) = client.as_ref() {
        Some(
            client
                .turn
                .try_lock()
                .map_err(|_| "Stop the running response before deleting this conversation")?,
        )
    } else {
        None
    };
    state
        .deleted
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone());
    let result = state
        .db
        .lock()
        .map_err(|e| e.to_string())
        .and_then(|mut db| storage::delete(&mut db, &id).map_err(|e| e.to_string()));
    if result.is_err() {
        state.deleted.lock().map_err(|e| e.to_string())?.remove(&id);
        return result;
    }
    if let Some(client) = clients.remove(&id) {
        client.shutdown();
    }
    Ok(())
}
#[tauri::command]
fn messages(app: tauri::AppHandle, id: String) -> Result<Value, String> {
    let state = app.state::<AppState>();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    storage::messages(&db, &id).map_err(|e| e.to_string())
}
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db = Connection::open(dir.join("history.sqlite3"))?;
            storage::initialize(&db)?;
            app.manage(AppState {
                clients: Default::default(),
                db: Mutex::new(db),
                connecting: Default::default(),
                deleted: Default::default(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            startup_directory,
            new_session,
            resume_session,
            prompt,
            permission,
            cancel,
            history,
            messages,
            close_session,
            delete_session,
            rename_session
        ])
        .run(tauri::generate_context!())
        .expect("Agent Desk failed");
}
