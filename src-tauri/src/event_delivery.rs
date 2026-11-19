use serde_json::{json, Value};

// Streamed provider activity may remain visible when history fails, but a user
// turn represents a submission and must never be published without a saved row.
pub fn publish(kind: &str, mut payload: Value, saved: Result<i64, String>, mut emit: impl FnMut(&str, Value)) -> Option<i64> {
    let sequence = match saved {
        Ok(seq) => { payload["seq"] = json!(seq); Some(seq) },
        Err(error) => {
            emit("history-error", json!(format!("Unable to save conversation activity: {error}")));
            None
        }
    };
    if kind != "user" || sequence.is_some() { emit("agent-event", payload); }
    sequence
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use crate::storage;

    #[test]
    fn failed_user_write_reports_error_without_publishing_an_unsent_turn() {
        let db = Connection::open_in_memory().unwrap();
        storage::initialize(&db).unwrap();
        db.execute_batch("PRAGMA query_only=ON").unwrap();
        let saved = storage::append(&db, "chat", "user", &json!("unsent draft"), 1).map_err(|e| e.to_string());
        assert!(saved.is_err());
        let mut emitted = vec![];
        assert_eq!(publish("user", json!({"kind":"user","data":"unsent draft"}), saved, |name,payload| emitted.push((name.to_string(),payload))), None);
        assert_eq!(emitted.len(), 1);
        assert_eq!(emitted[0].0, "history-error");
        assert!(storage::messages(&db, "chat").unwrap().as_array().unwrap().is_empty());
    }
    #[test]
    fn saved_user_turn_is_published_with_its_persisted_sequence() {
        let db = Connection::open_in_memory().unwrap();
        storage::initialize(&db).unwrap();
        let seq = storage::append(&db, "chat", "user", &json!("recorded prompt"), 1).unwrap();
        let mut emitted = vec![];
        assert_eq!(publish("user", json!({"kind":"user","data":"recorded prompt"}), Ok(seq), |name,payload| emitted.push((name.to_string(),payload))), Some(seq));
        assert_eq!(emitted, vec![("agent-event".into(),json!({"kind":"user","data":"recorded prompt","seq":seq}))]);
    }
    #[test]
    fn failed_activity_write_still_reports_live_provider_output() {
        let mut emitted = vec![];
        assert_eq!(publish("delta", json!({"kind":"delta","data":"partial response"}), Err("disk full".into()), |name,payload| emitted.push((name.to_string(),payload))), None);
        assert_eq!(emitted.len(),2);
        assert_eq!(emitted[0].0,"history-error");
        assert_eq!(emitted[1],("agent-event".into(),json!({"kind":"delta","data":"partial response"})));
    }
}
