use super::*;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::Mutex as AsyncMutex;

static IMPORT_LOCK: AsyncMutex<()> = AsyncMutex::const_new(());

async fn initialize(client: &acp::Client) -> Result<Value, String> {
    let init = client
        .request(
            "initialize",
            json!({
                "protocolVersion":1,
                "clientCapabilities":{},
                "clientInfo":{"name":"agent-desk","version":"0.1.0"}
            }),
        )
        .await?;
    if init["protocolVersion"] != 1 {
        return Err("Provider did not negotiate ACP v1".into());
    }
    if !init["authMethods"]
        .as_array()
        .is_none_or(|methods| methods.is_empty())
        && !init["agentCapabilities"].is_object()
    {
        return Err("Sign in with the provider CLI, then try opening a session again.".into());
    }
    Ok(init)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListedSession {
    session_id: String,
    title: Option<String>,
    updated_at: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPage {
    sessions: Vec<ListedSession>,
    next_cursor: Option<String>,
}

pub(super) async fn list_page(
    client: &acp::Client,
    cwd: &str,
    cursor: Option<String>,
) -> Result<SessionPage, String> {
    let init = initialize(client).await?;
    if !init["agentCapabilities"]["sessionCapabilities"]["list"].is_object() {
        return Err("This provider does not advertise ACP session listing. Check that it is signed in and supports session discovery.".into());
    }
    if init["agentCapabilities"]["loadSession"] != true {
        return Err(
            "This provider does not advertise ACP session loading with transcript replay.".into(),
        );
    }
    let mut params = json!({"cwd":cwd});
    if let Some(cursor) = cursor {
        params["cursor"] = json!(cursor);
    }
    let result = client.request("session/list", params).await?;
    let sessions = result["sessions"]
        .as_array()
        .ok_or("Provider returned an invalid session list")?;
    let mut seen = HashSet::new();
    let sessions = sessions
        .iter()
        .filter_map(|session| {
            let id = session["sessionId"].as_str()?;
            let project = session["cwd"].as_str()?;
            if id.is_empty() {
                return None;
            }
            if project != cwd
                && platform::project_directory(std::path::Path::new(project)).as_deref() != Ok(cwd)
            {
                return None;
            }
            if !seen.insert(id) {
                return None;
            }
            Some(ListedSession {
                session_id: id.to_owned(),
                title: session["title"]
                    .as_str()
                    .map(|title| storage::one_line(title, 180)),
                updated_at: session["updatedAt"].as_str().map(str::to_owned),
            })
        })
        .collect();
    Ok(SessionPage {
        sessions,
        next_cursor: result["nextCursor"]
            .as_str()
            .filter(|cursor| !cursor.is_empty())
            .map(str::to_owned),
    })
}

#[tauri::command]
pub async fn list_provider_sessions(
    mut provider: Provider,
    cursor: Option<String>,
) -> Result<SessionPage, String> {
    provider.cwd = platform::project_directory(std::path::Path::new(&provider.cwd))?;
    let client = acp::Client::start_transport(&provider, Arc::new(|_, _| {})).await?;
    list_page(&client, &provider.cwd, cursor).await
}

#[derive(Serialize)]
pub struct OpenedSession {
    id: String,
    cwd: String,
}

#[tauri::command]
pub async fn open_provider_session(
    app: tauri::AppHandle,
    mut provider: Provider,
    remote_id: String,
    title: Option<String>,
) -> Result<OpenedSession, String> {
    if remote_id.trim().is_empty() {
        return Err("Choose a provider session first".into());
    }
    provider.cwd = platform::project_directory(std::path::Path::new(&provider.cwd))?;
    let _import = IMPORT_LOCK
        .try_lock()
        .map_err(|_| "Another provider session is opening")?;
    let state = app.state::<AppState>();
    let existing = {
        use rusqlite::OptionalExtension;
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT id,cwd FROM sessions WHERE provider_id=?1 AND remote_id=?2 ORDER BY rowid LIMIT 1",
            params![provider.id,remote_id],
            |row| Ok(OpenedSession { id: row.get(0)?, cwd: row.get(1)? }),
        ).optional().map_err(|e| e.to_string())?
    };
    if let Some(existing) = existing {
        super::resume_session(app.clone(), existing.id.clone(), provider).await?;
        return Ok(existing);
    }

    let id = uuid::Uuid::new_v4().to_string();
    let publish = Arc::new(AtomicBool::new(false));
    let client = acp::Client::start_transport(&provider, {
        let (app, id, publish) = (app.clone(), id.clone(), publish.clone());
        Arc::new(move |kind, data| {
            if publish.load(Ordering::SeqCst) {
                event(&app, &id, kind, data);
            }
        })
    })
    .await?;
    let init = initialize(&client).await?;
    if init["agentCapabilities"]["loadSession"] != true {
        return Err(
            "This provider does not advertise ACP session loading with transcript replay.".into(),
        );
    }
    let transcript = client.import_session(&remote_id, &provider.cwd).await?;
    if !client.is_connected() {
        return Err("The provider disconnected while loading the session".into());
    }
    *client.prompt_caps.lock().map_err(|e| e.to_string())? =
        init["agentCapabilities"]["promptCapabilities"].clone();
    let selection = client.agent_snapshot()?;

    {
        let mut db = state.db.lock().map_err(|e| e.to_string())?;
        let transaction = db.transaction().map_err(|e| e.to_string())?;
        let title = title
            .map(|value| storage::one_line(&value, 180))
            .filter(|value| !value.is_empty());
        transaction.execute(
            "INSERT INTO sessions(id,provider,cwd,remote_id,provider_id,title) VALUES(?1,?2,?3,?4,?5,?6)",
            params![id,provider.name,provider.cwd,remote_id,provider.id,title],
        ).map_err(|e| e.to_string())?;
        let at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        for (kind, text) in transcript {
            storage::append(&transaction, &id, kind, &json!(text), at)
                .map_err(|e| e.to_string())?;
        }
        storage::append(&transaction, &id, "connection_started", &init, at)
            .map_err(|e| e.to_string())?;
        storage::append(&transaction, &id, "agent_state", &selection, at)
            .map_err(|e| e.to_string())?;
        storage::save_agent_preferences(
            &transaction,
            &id,
            &storage::AgentPreferences::from_snapshot(&selection),
        )
        .map_err(|e| e.to_string())?;
        transaction.commit().map_err(|e| e.to_string())?;
    }
    publish.store(true, Ordering::SeqCst);
    client.enable_live_selections();
    if !client.is_connected() {
        event(&app, &id, "disconnected", Value::Null);
    }
    state.clients.lock().await.insert(id.clone(), client);
    Ok(OpenedSession {
        id,
        cwd: provider.cwd,
    })
}
