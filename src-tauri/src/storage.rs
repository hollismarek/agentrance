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
    for column in ["remote_id", "provider_id"] {
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
#[cfg(test)]
mod tests {
    use super::*;
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
}
