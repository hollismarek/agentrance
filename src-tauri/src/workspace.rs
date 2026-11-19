use std::{io::{Read, Write}, path::Path};

const LIMIT: usize = 8 * 1024 * 1024;
static SAVE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub fn load(directory: &Path) -> Result<Option<String>, String> {
    let file = match std::fs::File::open(directory.join("workspace.json")) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    let mut raw = String::new();
    file.take((LIMIT + 1) as u64).read_to_string(&mut raw).map_err(|e| e.to_string())?;
    if raw.len() > LIMIT { return Err("Workspace recovery exceeds the 8 MB limit".into()); }
    Ok(Some(raw))
}

pub fn save(directory: &Path, raw: &str) -> Result<(), String> {
    if raw.len() > LIMIT { return Err("Workspace recovery exceeds the 8 MB limit".into()); }
    let value: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    if !value.is_object() || value["version"] != 1 {
        return Err("Unsupported workspace recovery format".into());
    }
    let _lock = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let pending = directory.join("workspace.json.new");
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    let mut file = options.open(&pending).map_err(|e| e.to_string())?;
    file.write_all(raw.as_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    std::fs::rename(pending, directory.join("workspace.json")).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn workspace_recovery_is_channel_local_atomic_and_bounded() {
        let root = std::env::temp_dir().join(format!("agentrance-workspace-{}", uuid::Uuid::new_v4()));
        let stable = root.join("stable"); let dev = root.join("dev");
        let raw = r#"{"version":1,"drafts":{"chat":{"text":"unfinished"}}}"#;
        assert_eq!(load(&stable).unwrap(), None);
        save(&stable, raw).unwrap();
        assert_eq!(load(&stable).unwrap().as_deref(), Some(raw));
        assert_eq!(load(&dev).unwrap(), None);
        for invalid in ["invalid".to_string(), "[]".into(), r#"{"version":2}"#.into(), " ".repeat(LIMIT + 1)] {
            assert!(save(&stable, &invalid).is_err());
            assert_eq!(load(&stable).unwrap().as_deref(), Some(raw));
        }
        save(&stable, r#"{"version":1}"#).unwrap();
        #[cfg(unix)]
        { use std::os::unix::fs::PermissionsExt; assert_eq!(std::fs::metadata(stable.join("workspace.json")).unwrap().permissions().mode() & 0o777, 0o600); }
        std::fs::remove_dir_all(root).unwrap();
    }
}
