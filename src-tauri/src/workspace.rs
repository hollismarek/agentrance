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

pub fn validate_recovery(raw: &str) -> Result<(), String> {
    let value = serde_json::from_str(raw).map_err(|_| "Invalid workspace recovery format in backup")?;
    validate_value(value)
}

fn validate_value(value: serde_json::Value) -> Result<(), String> {
    use serde::Deserialize;
    use std::collections::{HashMap, HashSet};

    #[derive(Deserialize)]
    struct Recovery {
        #[serde(flatten)]
        layouts: Layouts,
        drafts: HashMap<String, serde_json::Value>,
        #[serde(rename = "recentProjects")]
        _recent_projects: Vec<String>,
    }
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Layouts {
        Named { workspaces: NamedLayouts },
        Legacy { workspace: Layout },
    }
    #[derive(Deserialize)]
    struct NamedLayouts {
        active: String,
        entries: Vec<NamedLayout>,
    }
    #[derive(Deserialize)]
    struct NamedLayout {
        id: String,
        name: String,
        #[serde(rename = "project")]
        _project: String,
        layout: Layout,
    }
    #[derive(Deserialize)]
    struct Layout {
        mode: String,
        focus: usize,
        groups: [Vec<String>; 4],
        selected: [Option<String>; 4],
    }
    #[derive(Deserialize)]
    struct Draft {
        #[serde(rename = "text")]
        _text: String,
        #[serde(rename = "missingAttachments")]
        _missing_attachments: Vec<String>,
    }

    let error = || "Invalid workspace recovery format in backup".to_string();
    let version = value["version"].as_u64();
    let recovery: Recovery = serde_json::from_value(value).map_err(|_| error())?;
    let layouts = match (version, recovery.layouts) {
        (Some(1), Layouts::Legacy { workspace }) => vec![workspace],
        (Some(2), Layouts::Named { workspaces }) => {
            if workspaces.entries.is_empty() || workspaces.entries.len() > 20 {
                return Err(error());
            }
            let mut names = HashSet::new();
            for entry in &workspaces.entries {
                if entry.id.is_empty() || !names.insert(&entry.id)
                    || entry.name.trim().is_empty() || entry.name.encode_utf16().count() > 60 {
                    return Err(error());
                }
            }
            if !names.contains(&workspaces.active) { return Err(error()); }
            workspaces.entries.into_iter().map(|entry| entry.layout).collect()
        }
        _ => return Err(error()),
    };
    let mut seen = HashSet::new();
    for layout in layouts {
        let panes = match layout.mode.as_str() {
            "single" => 1,
            "columns" | "rows" => 2,
            "three" => 3,
            "grid" => 4,
            _ => return Err(error()),
        };
        if layout.focus >= panes || layout.groups[panes..].iter().any(|group| !group.is_empty()) {
            return Err(error());
        }
        for (group, selected) in layout.groups.iter().zip(layout.selected.iter()) {
            if selected.as_ref().is_some_and(|id| !group.contains(id)) { return Err(error()); }
            for id in group {
                if id.is_empty() || !seen.insert(id.clone()) || seen.len() > 1000 { return Err(error()); }
                if let Some(draft) = recovery.drafts.get(id) {
                    if !draft.is_object() { return Err(error()); }
                    serde_json::from_value::<Draft>(draft.clone()).map_err(|_| error())?;
                }
            }
        }
    }
    Ok(())
}

pub fn save(directory: &Path, raw: &str) -> Result<(), String> {
    if raw.len() > LIMIT { return Err("Workspace recovery exceeds the 8 MB limit".into()); }
    let value: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    if !value.is_object() || (value["version"] != 1 && value["version"] != 2) {
        return Err("Unsupported workspace recovery format".into());
    }
    if value["version"] == 2 { validate_value(value)?; }
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
    fn recovery_validates_legacy_and_named_workspaces() {
        validate_recovery(include_str!("../../tests/fixtures/backup-workspace.json")).unwrap();
        let raw = include_str!("../../tests/fixtures/backup-workspaces.json");
        validate_recovery(raw).unwrap();
        let mut named: serde_json::Value = serde_json::from_str(raw).unwrap();
        named["workspaces"]["entries"][1]["layout"]["groups"][1][0] = "one".into();
        named["workspaces"]["entries"][1]["layout"]["selected"][1] = "one".into();
        assert!(validate_recovery(&named.to_string()).is_err());
    }
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
