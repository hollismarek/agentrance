use rusqlite::{params, Connection};
use serde_json::{json, Value};

pub fn initialize(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch("PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,provider TEXT NOT NULL,cwd TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events(session TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,at INTEGER);")?;
    let has_at = db
        .prepare("PRAGMA table_info(events)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .any(|name| name == "at");
    if !has_at {
        db.execute("ALTER TABLE events ADD COLUMN at INTEGER", [])?;
    }
    let columns = db
        .prepare("PRAGMA table_info(sessions)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    for column in ["remote_id", "provider_id", "title", "agent_preferences"] {
        if !columns.iter().any(|c| c == column) {
            db.execute(
                &format!("ALTER TABLE sessions ADD COLUMN {column} TEXT"),
                [],
            )?;
        }
    }
    // Before session IDs were stored explicitly, permission requests retained
    // the ACP sessionId. Recover only unambiguous IDs from that same local chat.
    db.execute_batch(
        "UPDATE sessions SET remote_id=(
        SELECT MIN(json_extract(data,'$.params.sessionId')) FROM events
        WHERE events.session=sessions.id AND kind='permission' AND json_valid(data)
        AND json_type(data,'$.params.sessionId')='text'
        AND length(json_extract(data,'$.params.sessionId'))>0
        HAVING COUNT(DISTINCT json_extract(data,'$.params.sessionId'))=1
    ) WHERE remote_id IS NULL;",
    )?;
    db.execute(
        "CREATE INDEX IF NOT EXISTS events_session ON events(session)",
        [],
    )?;
    Ok(())
}
pub fn append(
    db: &Connection,
    session: &str,
    kind: &str,
    data: &Value,
    at: i64,
) -> rusqlite::Result<i64> {
    db.execute(
        "INSERT INTO events(session,kind,data,at) VALUES(?1,?2,?3,?4)",
        params![session, kind, data.to_string(), at],
    )?;
    Ok(db.last_insert_rowid())
}
pub fn messages(db: &Connection, session: &str) -> rusqlite::Result<Value> {
    let mut q =
        db.prepare("SELECT rowid,kind,data,at FROM events WHERE session=?1 ORDER BY rowid")?;
    let rows = q.query_map([session], |r| {
        let data: String = r.get(2)?;
        Ok(json!({"seq":r.get::<_,i64>(0)?,"kind":r.get::<_,String>(1)?,
            "data":serde_json::from_str::<Value>(&data).unwrap_or(Value::Null),"at":r.get::<_,Option<i64>>(3)?}))
    })?;
    Ok(Value::Array(rows.collect::<Result<Vec<_>, _>>()?))
}
pub struct SavedConnection {
    pub remote_id: Option<String>,
    pub provider_id: Option<String>,
    pub provider: String,
    pub cwd: String,
}
pub fn connection(db: &Connection, id: &str) -> rusqlite::Result<SavedConnection> {
    db.query_row(
        "SELECT remote_id,provider_id,provider,cwd FROM sessions WHERE id=?1",
        [id],
        |r| {
            Ok(SavedConnection {
                remote_id: r.get(0)?,
                provider_id: r.get(1)?,
                provider: r.get(2)?,
                cwd: r.get(3)?,
            })
        },
    )
}
#[derive(Debug, Default, serde::Deserialize, serde::Serialize, PartialEq)]
pub struct AgentPreferences {
    pub agent: Option<String>,
    pub model: Option<String>,
}

impl AgentPreferences {
    pub fn from_snapshot(snapshot: &Value) -> Self {
        Self {
            agent: snapshot["selection"]["current"].as_str().map(str::to_owned),
            model: snapshot["model"]["current"].as_str().map(str::to_owned),
        }
    }
}

pub fn save_agent_preferences(db: &Connection, id: &str, preferences: &AgentPreferences) -> rusqlite::Result<()> {
    let raw = json!(preferences).to_string();
    db.execute("UPDATE sessions SET agent_preferences=?1 WHERE id=?2", params![raw,id])?;
    Ok(())
}

pub fn agent_preferences(db: &Connection, id: &str) -> rusqlite::Result<AgentPreferences> {
    use rusqlite::OptionalExtension;
    let saved: Option<String> = db.query_row(
        "SELECT agent_preferences FROM sessions WHERE id=?1", [id], |row| row.get(0),
    )?;
    if let Some(saved) = saved {
        if let Ok(preferences) = serde_json::from_str(&saved) {
            return Ok(preferences);
        }
    }
    // Older installations already recorded provider-confirmed selections.
    let legacy: Option<String> = db.query_row(
        "SELECT data FROM events WHERE session=?1 AND kind='agent_state' ORDER BY rowid DESC LIMIT 1",
        [id], |row| row.get(0),
    ).optional()?;
    Ok(legacy.and_then(|raw| serde_json::from_str(&raw).ok())
        .map(|snapshot| AgentPreferences::from_snapshot(&snapshot)).unwrap_or_default())
}

pub fn one_line(text: &str, limit: usize) -> String {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() > limit {
        format!(
            "{}…",
            normalized
                .chars()
                .take(limit.saturating_sub(1))
                .collect::<String>()
                .trim_end()
        )
    } else {
        normalized
    }
}
pub fn history(db: &Connection) -> rusqlite::Result<Value> {
    let mut q = db.prepare(
        "SELECT id,provider,cwd,provider_id,remote_id,title,
      (SELECT data FROM events WHERE session=s.id AND kind='user' ORDER BY rowid LIMIT 1),
      (SELECT MAX(at) FROM events WHERE session=s.id AND kind!='session_closed') AS updated_at
      FROM sessions s ORDER BY COALESCE(updated_at,0) DESC,s.rowid DESC",
    )?;
    let rows=q.query_map([],|r|{
        let custom:Option<String>=r.get(5)?;
        let first:Option<String>=r.get(6)?;
        let prompt=first.and_then(|raw|serde_json::from_str::<Value>(&raw).ok()).and_then(|v|v.as_str().map(String::from)).unwrap_or_default();
        let title=custom.unwrap_or_else(||{let line=one_line(&prompt,88);if line.is_empty(){"New conversation".into()}else{line}});
        Ok(json!({"id":r.get::<_,String>(0)?,"provider":r.get::<_,String>(1)?,"cwd":r.get::<_,String>(2)?,
            "providerId":r.get::<_,Option<String>>(3)?,"canResume":r.get::<_,Option<String>>(4)?.is_some(),
            "title":title,"updatedAt":r.get::<_,Option<i64>>(7)?}))
    })?;
    Ok(Value::Array(rows.collect::<Result<Vec<_>, _>>()?))
}
pub fn rename(db: &Connection, id: &str, title: &str) -> Result<(), String> {
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.is_empty() || title.chars().count() > 120 {
        return Err("Choose a title between 1 and 120 characters".into());
    }
    let count = db
        .execute(
            "UPDATE sessions SET title=?1 WHERE id=?2",
            params![title, id],
        )
        .map_err(|e| e.to_string())?;
    if count == 0 {
        return Err("Conversation no longer exists".into());
    }
    Ok(())
}
pub fn delete(db: &mut Connection, id: &str) -> rusqlite::Result<()> {
    let tx = db.transaction()?;
    tx.execute("DELETE FROM events WHERE session=?1", [id])?;
    tx.execute("DELETE FROM sessions WHERE id=?1", [id])?;
    tx.commit()
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saved_agent_preferences_survive_provider_defaults_and_are_per_conversation() {
        let db = Connection::open_in_memory().unwrap();
        initialize(&db).unwrap();
        db.execute_batch("INSERT INTO sessions(id,provider,cwd) VALUES ('a','Test','/tmp'), ('b','Test','/tmp');").unwrap();
        let legacy = json!({"selection":{"current":"review"},"model":{"current":"sonnet"}});
        append(&db, "a", "agent_state", &legacy, 1).unwrap();
        let preferences = agent_preferences(&db, "a").unwrap();
        assert_eq!(preferences.agent.as_deref(), Some("review"));
        assert_eq!(preferences.model.as_deref(), Some("sonnet"));
        save_agent_preferences(&db, "a", &preferences).unwrap();
        let defaults = json!({"selection":{"current":"plan"},"model":{"current":"auto"}});
        append(&db, "a", "agent_state", &defaults, 2).unwrap();
        assert_eq!(agent_preferences(&db, "a").unwrap(), preferences);
        assert_eq!(agent_preferences(&db, "b").unwrap(), AgentPreferences::default());
    }
    #[test]
    fn migrates_old_history_without_inventing_timestamps() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE events(session TEXT,kind TEXT,data TEXT); INSERT INTO events VALUES('a','tool','{\"toolCallId\":\"old\"}');").unwrap();
        initialize(&db).unwrap();
        initialize(&db).unwrap();
        let rows = messages(&db, "a").unwrap();
        assert_eq!(rows[0]["data"]["toolCallId"], "old");
        assert!(rows[0]["at"].is_null());
    }
    #[test]
    fn replays_stream_and_permissions_in_order_and_isolates_sessions() {
        let db = Connection::open_in_memory().unwrap();
        initialize(&db).unwrap();
        append(&db, "b", "tool", &json!({"toolCallId":"same"}), 10).unwrap();
        for (at, kind, data) in [
            (
                20,
                "tool",
                json!({"toolCallId":"same","status":"in_progress"}),
            ),
            (30, "permission", json!({"request":1})),
            (
                40,
                "permission_resolved",
                json!({"request":1,"option":"allow"}),
            ),
            (
                50,
                "tool",
                json!({"toolCallId":"same","rawOutput":{"stdout":"partial"}}),
            ),
            (
                60,
                "tool",
                json!({"toolCallId":"same","status":"completed","rawOutput":{"stdout":"partial done","exitCode":0}}),
            ),
        ] {
            append(&db, "a", kind, &data, at).unwrap();
        }
        let rows = messages(&db, "a").unwrap();
        assert_eq!(rows.as_array().unwrap().len(), 5);
        assert_eq!(rows[3]["data"]["rawOutput"]["stdout"], "partial");
        assert_eq!(rows[4]["at"], 60);
        assert_eq!(messages(&db, "b").unwrap().as_array().unwrap().len(), 1);
    }
    #[test]
    fn recovers_only_unambiguous_legacy_permission_session_ids() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            r#"CREATE TABLE sessions(id TEXT PRIMARY KEY,provider TEXT,cwd TEXT);
          CREATE TABLE events(session TEXT,kind TEXT,data TEXT);
          INSERT INTO sessions VALUES('a','Kiro','/tmp'),('b','Kiro','/tmp'),('c','Kiro','/tmp');
          INSERT INTO events VALUES('a','permission','{"params":{"sessionId":"remote-a"}}'),
          ('a','permission','{"params":{"sessionId":"remote-a"}}'),
          ('b','permission','{"params":{"sessionId":"remote-b"}}'),
          ('b','permission','{"params":{"sessionId":"different"}}');"#,
        )
        .unwrap();
        initialize(&db).unwrap();
        initialize(&db).unwrap();
        assert_eq!(
            connection(&db, "a").unwrap().remote_id.as_deref(),
            Some("remote-a")
        );
        assert!(connection(&db, "b").unwrap().remote_id.is_none());
        assert!(connection(&db, "c").unwrap().remote_id.is_none());
        assert!(connection(&db, "a").unwrap().provider_id.is_none());
    }
    #[test]
    fn closing_connections_preserves_history_order_and_lifecycle_replay() {
        let db=Connection::open_in_memory().unwrap();
        initialize(&db).unwrap();
        db.execute_batch("INSERT INTO sessions(id,provider,cwd) VALUES('older','Kiro','/tmp'),('newer','Kiro','/tmp'),('empty','Kiro','/tmp');").unwrap();
        append(&db,"older","user",&json!("Older prompt"),100).unwrap();
        append(&db,"older","done",&Value::Null,120).unwrap();
        append(&db,"newer","user",&json!("Newer prompt"),200).unwrap();
        append(&db,"older","session_closed",&Value::Null,300).unwrap();
        append(&db,"empty","session_closed",&Value::Null,400).unwrap();
        let rows=history(&db).unwrap();
        assert_eq!(rows[0]["id"],"newer");assert_eq!(rows[1]["id"],"older");
        assert_eq!(rows[1]["updatedAt"],120);assert!(rows[2]["updatedAt"].is_null());
        let replay=messages(&db,"older").unwrap();
        assert_eq!(replay.as_array().unwrap().last().unwrap()["kind"],"session_closed");
        append(&db,"older","user",&json!("Actual follow-up"),500).unwrap();
        assert_eq!(history(&db).unwrap()[0]["id"],"older");
    }
    #[test]
    fn derives_legacy_summaries_and_keeps_manual_titles() {
        let db = Connection::open_in_memory().unwrap();
        initialize(&db).unwrap();
        db.execute(
            "INSERT INTO sessions(id,provider,cwd) VALUES('a','Kiro','/tmp')",
            [],
        )
        .unwrap();
        assert_eq!(history(&db).unwrap()[0]["title"], "New conversation");
        append(
            &db,
            "a",
            "user",
            &json!("  Review\n the repository\t please  "),
            100,
        )
        .unwrap();
        append(&db, "a", "user", &json!("A different follow-up"), 200).unwrap();
        assert_eq!(
            history(&db).unwrap()[0]["title"],
            "Review the repository please"
        );
        rename(&db, "a", "  Printer driver investigation ").unwrap();
        initialize(&db).unwrap();
        assert_eq!(
            history(&db).unwrap()[0]["title"],
            "Printer driver investigation"
        );
        assert_eq!(history(&db).unwrap()[0]["updatedAt"], 200);
        assert!(rename(&db, "a", "   ").is_err());
        assert!(rename(&db, "missing", "title").is_err());
        let unicode = one_line(&"🦀".repeat(200), 88);
        assert_eq!(unicode.chars().count(), 88);
        assert!(unicode.ends_with('…'));
    }
    #[test]
    fn deletion_is_atomic_and_isolated_from_other_chats() {
        let mut db = Connection::open_in_memory().unwrap();
        initialize(&db).unwrap();
        db.execute(
            "INSERT INTO sessions(id,provider,cwd) VALUES('a','Kiro','/tmp'),('b','Kiro','/tmp')",
            [],
        )
        .unwrap();
        append(&db, "a", "user", &json!("Remove me"), 100).unwrap();
        append(&db, "a", "tool", &json!({"x":1}), 120).unwrap();
        append(&db, "b", "user", &json!("Keep me"), 200).unwrap();
        delete(&mut db, "a").unwrap();
        delete(&mut db, "a").unwrap();
        assert_eq!(history(&db).unwrap().as_array().unwrap().len(), 1);
        assert_eq!(history(&db).unwrap()[0]["title"], "Keep me");
        assert!(messages(&db, "a").unwrap().as_array().unwrap().is_empty());
        assert_eq!(messages(&db, "b").unwrap().as_array().unwrap().len(), 1);
        // A failing second statement must roll back removal of the event rows.
        db.execute_batch("CREATE TRIGGER prevent_delete BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT,'test'); END;").unwrap();
        assert!(delete(&mut db, "b").is_err());
        assert_eq!(messages(&db, "b").unwrap().as_array().unwrap().len(), 1);
    }
}
