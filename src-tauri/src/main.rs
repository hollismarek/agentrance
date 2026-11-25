#![cfg_attr(all(target_os = "windows", not(debug_assertions)), windows_subsystem = "windows")]

mod platform;
mod discovery;
mod attachments;
mod channel;
mod settings;
mod workspace;
mod acp;
mod agents;
mod clipboard;
mod resume;
mod storage;
mod event_delivery;
mod backup;
mod provider_sessions;
mod project_brief;
mod git_diff;
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
    profile: std::path::PathBuf,
    recovery_guard: std::sync::atomic::AtomicBool,
    clients: tokio::sync::Mutex<HashMap<String, Arc<acp::Client>>>,
    db: Mutex<Connection>,
    connecting: Mutex<HashSet<String>>,
    // Retain suppression markers for this app run: killing a provider does not
    // synchronously join its reader task or drain in-flight command callbacks.
    // Reclamation must await all producers; removing at commit is unsafe.
    deleted: Mutex<HashSet<String>>,
}
#[tauri::command]
fn enable_workspace_recovery_guard(app: tauri::AppHandle) {
    app.state::<AppState>().recovery_guard.store(true, std::sync::atomic::Ordering::SeqCst);
}
#[tauri::command]
fn finish_app_exit(app: tauri::AppHandle) {
    app.state::<AppState>().recovery_guard.store(false, std::sync::atomic::Ordering::SeqCst);
    app.exit(0);
}
fn event(app: &tauri::AppHandle, id: &str, kind: &str, data: Value) {
    let _ = record_event(app, id, kind, data);
}
fn record_event(app: &tauri::AppHandle, id: &str, kind: &str, data: Value) -> Option<i64> {
    let remember = kind == "agent_state_live";
    let kind = if remember { "agent_state" } else { kind };
    let at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let state = app.state::<AppState>();
    let payload = json!({"session":id,"kind":kind,"data":data,"at":at});
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
                    return None;
                }
                storage::record_activity(&db, id, kind, &data, at, remember).map_err(|e| e.to_string())
            }
            Err(e) => Err(e),
        }
    };
    event_delivery::publish(kind, payload, saved, |name,payload| { let _ = app.emit(name,payload); })
}
#[tauri::command]
fn load_provider_settings(app: tauri::AppHandle) -> Result<Option<String>, String> {
    settings::load(&app.state::<AppState>().profile)
}
#[tauri::command]
fn save_provider_settings(app: tauri::AppHandle, raw: String) -> Result<(), String> {
    settings::save(&app.state::<AppState>().profile, &raw)
}
#[tauri::command]
fn load_workspace(app: tauri::AppHandle) -> Result<Option<String>, String> {
    workspace::load(&app.state::<AppState>().profile)
}
#[tauri::command]
fn save_workspace(app: tauri::AppHandle, raw: String) -> Result<(), String> {
    workspace::save(&app.state::<AppState>().profile, &raw)
}
#[tauri::command]
async fn create_backup(app: tauri::AppHandle, destination: std::path::PathBuf) -> Result<(), String> {
    let profile = app.state::<AppState>().profile.clone();
    tauri::async_runtime::spawn_blocking(move || backup::create(&profile, &destination))
        .await.map_err(|error| error.to_string())?
}
#[tauri::command]
async fn stage_backup_restore(app: tauri::AppHandle, archive: std::path::PathBuf) -> Result<(), String> {
    let root = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let profile = app.state::<AppState>().profile.clone();
    tauri::async_runtime::spawn_blocking(move || backup::restore(&root, &profile, &archive))
        .await.map_err(|error| error.to_string())?
}
#[tauri::command]
fn backup_profile_status(app: tauri::AppHandle) -> Result<backup::ProfileStatus, String> {
    let root = app.path().app_data_dir().map_err(|error| error.to_string())?;
    backup::profile_status(&root)
}
#[tauri::command]
fn cancel_backup_restore(app: tauri::AppHandle) -> Result<(), String> {
    backup::cancel_restore(&app.path().app_data_dir().map_err(|error| error.to_string())?)
}
#[tauri::command]
fn stage_previous_profile(app: tauri::AppHandle) -> Result<(), String> {
    backup::stage_previous(&app.path().app_data_dir().map_err(|error| error.to_string())?)
}
#[tauri::command]
async fn discover_providers(app: tauri::AppHandle) -> Result<Vec<Provider>,String> {
    let home=app.path().home_dir().map_err(|e|e.to_string())?;
    static GATE:tokio::sync::Semaphore=tokio::sync::Semaphore::const_new(1);
    let permit=GATE.try_acquire().map_err(|_|"Provider detection is still running. You can configure providers manually.".to_string())?;
    let scan=tauri::async_runtime::spawn_blocking(move||{let _permit=permit;discovery::discover(&home)});
    tokio::time::timeout(std::time::Duration::from_secs(3),scan).await
        .map_err(|_|"Provider detection timed out. Add a provider manually or check again.".to_string())?
        .map_err(|e|e.to_string())
}
#[tauri::command]
fn app_channel() -> &'static str {
    if cfg!(debug_assertions) { "Development" } else { "Stable" }
}
#[tauri::command]
fn startup_directory() -> Result<String, String> {
    // Installed apps must ask for a project, not assume the launcher directory.
    if !cfg!(debug_assertions) { return Ok(String::new()); }
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
fn validate_project(path: String) -> Result<String, String> {
    platform::project_directory(std::path::Path::new(&path))
}
#[tauri::command]
async fn new_session(app: tauri::AppHandle, mut provider: Provider) -> Result<String, String> {
    let cwd = std::path::Path::new(&provider.cwd);
    if !cwd.is_absolute() || !cwd.is_dir() {
        return Err("Choose an existing absolute project folder before starting the session".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    provider.cwd = platform::project_directory(std::path::Path::new(&provider.cwd))?;
    let client = acp::Client::start(app.clone(), id.clone(), &provider).await?;
    let init=client.request("initialize",json!({"protocolVersion":1,"clientCapabilities":{},"clientInfo":{"name":"agent-desk","version":"0.1.0"}})).await?;
    *client.prompt_caps.lock().map_err(|e|e.to_string())?=init["agentCapabilities"]["promptCapabilities"].clone();
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
    let agent_state = client.agent_snapshot()?;
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
    event(&app, &id, "identity", client.recorded_handshake(init));
    event(&app, &id, "agent_state", agent_state);
    client.enable_live_selections();
    state.clients.lock().await.insert(id.clone(), client);
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
    let (saved, preferences) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let saved = storage::connection(&db, &id).map_err(|e| e.to_string())?;
        let preferences = storage::agent_preferences(&db, &id).map_err(|e| e.to_string())?;
        (saved, preferences)
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
        return Err(format!("The conversation's original project directory '{}' is unavailable. Restore the directory at this path to continue this chat. If the project moved, update Settings and start a new session there; changing settings does not relocate saved conversations.", provider.cwd));
    }
    provider.cwd = platform::project_directory(std::path::Path::new(&provider.cwd))?;
    // Keep the preference separate from transient defaults reported during reconnect.
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        storage::save_agent_preferences(&db, &id, &preferences).map_err(|e| e.to_string())?;
    }
    let client = acp::Client::start(app.clone(), id.clone(), &provider).await?;
    let init=client.request("initialize",json!({"protocolVersion":1,"clientCapabilities":{},"clientInfo":{"name":"agent-desk","version":"0.1.0"}})).await?;
    *client.prompt_caps.lock().map_err(|e|e.to_string())?=init["agentCapabilities"]["promptCapabilities"].clone();
    if init["protocolVersion"] != 1 {
        return Err("Provider did not negotiate ACP v1".into());
    }
    client
        .restore(&init, &remote, &provider.cwd)
        .await
        .map_err(|e| format!("Could not continue this conversation: {e}"))?;
    let selection_warnings = client.restore_preferences(&preferences).await;
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .execute(
            "UPDATE sessions SET provider_id=?1 WHERE id=?2",
            params![provider.id, id],
        )
        .map_err(|e| e.to_string())?;
    let agent_state = client.agent_snapshot()?;
    event(&app, &id, "connection_started", client.recorded_handshake(init));
    event(&app, &id, "agent_state", agent_state);
    client.enable_live_selections();
    state.clients.lock().await.insert(id.clone(), client);
    if !selection_warnings.is_empty() {
        let _ = app.emit("history-error", selection_warnings.join("\n"));
    }
    Ok(())
}
#[tauri::command]
async fn set_agent(app: tauri::AppHandle, id: String, agent_id: String) -> Result<(), String> {
    let client = app
        .state::<AppState>()
        .clients
        .lock()
        .await
        .get(&id)
        .cloned()
        .ok_or("Continue this conversation before choosing an agent")?;
    client.set_agent(&agent_id).await?;
    if !app
        .state::<AppState>()
        .clients
        .lock()
        .await
        .get(&id)
        .is_some_and(|current| Arc::ptr_eq(current, &client))
    {
        return Err("The conversation connection closed during the agent switch".into());
    }
    Ok(())
}
#[tauri::command]
async fn set_model(app: tauri::AppHandle, id: String, model_id: String) -> Result<(), String> {
    let client = app
        .state::<AppState>()
        .clients
        .lock()
        .await
        .get(&id)
        .cloned()
        .ok_or("Continue this conversation before choosing a model")?;
    client.set_model(&model_id).await?;
    if !app
        .state::<AppState>()
        .clients
        .lock()
        .await
        .get(&id)
        .is_some_and(|current| Arc::ptr_eq(current, &client))
    {
        return Err("The conversation connection closed during the model switch".into());
    }
    Ok(())
}
#[tauri::command]
async fn prompt(app: tauri::AppHandle, id: String, text: String, attachments: Option<Vec<attachments::Attachment>>, submission_id: Option<String>) -> Result<(), String> {
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
    if !client.is_connected() { return Err("Provider disconnected; continue the conversation to reconnect".into()); }
    let files=attachments.unwrap_or_default();
    let caps=client.prompt_caps.lock().map_err(|e|e.to_string())?.clone();
    let blocks=attachments::prompt(&text,&files,&caps)?;
    let display=if files.is_empty(){text.clone()}else{format!("{}\n\nAttached: {}",text,files.iter().map(|f|f.name.as_str()).collect::<Vec<_>>().join(", "))};
    record_event(&app, &id, "user", json!(display))
        .ok_or("Could not record this prompt in history; your draft has been kept")?;
    // Only acknowledge after validation and successful history persistence.
    // The long-running prompt invocation itself resolves after the response.
    if let Some(submission_id) = submission_id {
        let _ = app.emit("prompt-accepted", json!({"id":id,"submissionId":submission_id}));
    }
    let remote = client.remote.lock().await.clone();
    let result = client
        .request(
            "session/prompt",
            json!({"sessionId":remote,"prompt":blocks}),
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
    let client = state.clients.lock().await.remove(&id);
    if let Some(client) = client {
        let was_connected = client.is_connected();
        client.shutdown();
        // Read-only tabs have no connection event. Live closure is retained for
        // lifecycle replay, but history ordering excludes session_closed.
        if was_connected {
            event(&app, &id, "session_closed", Value::Null);
        }
    }
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
    let mut context = tauri::generate_context!();
    channel::configure(context.config_mut(), cfg!(debug_assertions));
    #[cfg(debug_assertions)]
    context.set_default_window_icon(Some(tauri::include_image!("icons/dev/icon.png")));
    // GTK3's Wayland backend derives xdg_toplevel.app_id from the program
    // name, independently of GtkApplication's ID. Match desktop metadata
    // before Tauri initializes GTK or creates a window.
    #[cfg(target_os = "linux")]
    gtk::glib::set_prgname(Some(context.config().identifier.as_str()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<AppState>().recovery_guard.load(std::sync::atomic::Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.emit("workspace-close-requested", ());
                }
            }
        })
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let profile = backup::activate_profile(&dir).map_err(std::io::Error::other)?;
            let db = Connection::open(profile.join("history.sqlite3"))?;
            storage::initialize(&db)?;
            app.manage(AppState {
                profile,
                recovery_guard: Default::default(),
                clients: Default::default(),
                db: Mutex::new(db),
                connecting: Default::default(),
                deleted: Default::default(),
            });
            #[cfg(target_os = "linux")]
            if let Some(webview) = app.get_webview_window("main") {
                webview.with_webview(|webview| {
                    use webkit2gtk::{WebContextExt, WebViewExt};
                    if let Some(context) = webview.inner().context() {
                        let preferred = gtk::glib::language_names();
                        let languages: Vec<_> = preferred.iter().map(|name| name.as_str())
                            .filter(|name| *name != "C" && *name != "POSIX" && !name.contains(['.', '@']))
                            .collect();
                        context.set_spell_checking_enabled(true);
                        // Empty preferences let WebKit choose an installed dictionary.
                        context.set_spell_checking_languages(&languages);
                    }
                })?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            clipboard::copy_text,
            enable_workspace_recovery_guard,
            finish_app_exit,
            startup_directory,
            validate_project,
            project_brief::collect_project_brief,
            git_diff::git_diff_files,
            git_diff::git_diff_file,
            app_channel,
            discover_providers,
            load_provider_settings,
            save_provider_settings,
            load_workspace,
            save_workspace,
            create_backup,
            stage_backup_restore,
            backup_profile_status,
            cancel_backup_restore,
            stage_previous_profile,
            new_session,
            provider_sessions::list_provider_sessions,
            provider_sessions::open_provider_session,
            resume_session,
            set_agent,
            set_model,
            prompt,
            permission,
            cancel,
            history,
            messages,
            close_session,
            delete_session,
            rename_session
        ])
        .build(context)
        .expect("Agentrance failed")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if app.state::<AppState>().recovery_guard.load(std::sync::atomic::Ordering::SeqCst) {
                    api.prevent_exit();
                    let _ = app.emit("workspace-close-requested", ());
                }
            }
        });
}
