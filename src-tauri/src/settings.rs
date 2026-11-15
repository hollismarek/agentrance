use std::path::Path;
use super::Provider;
static SAVE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub fn load(directory: &Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(directory.join("providers.json")) {
        Ok(raw) => Ok(Some(raw)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
pub fn save(directory: &Path, raw: &str) -> Result<(), String> {
    let _guard = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    let providers: Vec<Provider> = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    if providers.is_empty() { return Err("Configure at least one provider".into()); }
    std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let pending = directory.join("providers.json.new");
    // Configuration may contain environment overrides; restrict file access on Unix.
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    let mut file = options.open(&pending).map_err(|e| e.to_string())?;
    use std::io::Write;
    file.write_all(raw.as_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    std::fs::rename(pending, directory.join("providers.json")).map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn channels_keep_separate_settings_and_reject_invalid_replacement() {
        let root=std::env::temp_dir().join(format!("agentdesk-settings-{}",uuid::Uuid::new_v4()));
        let stable=root.join("stable");let dev=root.join("dev");
        let raw=r#"[{"id":"kiro","name":"Kiro","executable":"kiro-cli","args":[],"env":{},"cwd":"/tmp"}]"#;
        assert_eq!(load(&dev).unwrap(),None);
        save(&stable,raw).unwrap();assert_eq!(load(&stable).unwrap().as_deref(),Some(raw));
        assert_eq!(load(&dev).unwrap(),None);
        save(&dev,&raw.replace("Kiro","Development Kiro")).unwrap();
        assert_ne!(load(&dev).unwrap(),load(&stable).unwrap());
        assert!(save(&stable,"[]").is_err());assert!(save(&stable,"invalid").is_err());
        assert_eq!(load(&stable).unwrap().as_deref(),Some(raw));
        save(&stable,raw).unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }
}
