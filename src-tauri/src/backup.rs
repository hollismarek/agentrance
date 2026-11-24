use rusqlite::{backup::Backup, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tempfile::{NamedTempFile, TempDir};
use uuid::Uuid;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

const HISTORY: &str = "history.sqlite3";
const PROVIDERS: &str = "providers.json";
const WORKSPACE: &str = "workspace.json";
const MANIFEST: &str = "manifest.json";
const ACTIVE: &str = "active-profile";
const PROFILES: &str = "profiles";
const SETTINGS_LIMIT: u64 = 8 * 1024 * 1024;
const HISTORY_LIMIT: u64 = 4 * 1024 * 1024 * 1024;
static RESTORE_LOCK: Mutex<()> = Mutex::new(());

fn manifest() -> Value {
    json!({"format": "agentrance-backup", "version": 1})
}

#[derive(Serialize, Deserialize)]
struct ProfileSelection {
    active: String,
    previous: Option<String>,
    pending: Option<String>,
}

fn read_selection(root: &Path) -> Result<ProfileSelection, String> {
    let marker = match fs::read_to_string(root.join(ACTIVE)) {
        Ok(marker) => marker,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(ProfileSelection {
                active: "root".into(),
                previous: None,
                pending: None,
            })
        }
        Err(error) => return Err(error.to_string()),
    };
    if let Ok(id) = Uuid::parse_str(marker.trim()) {
        return Ok(ProfileSelection {
            active: id.to_string(),
            previous: root.join(HISTORY).is_file().then(|| "root".into()),
            pending: None,
        });
    }
    serde_json::from_str(&marker).map_err(|e| format!("Invalid active profile marker: {e}"))
}

fn profile_path(root: &Path, id: &str) -> Result<PathBuf, String> {
    if id == "root" {
        return Ok(root.to_owned());
    }
    let id = Uuid::parse_str(id).map_err(|_| "Invalid profile ID")?;
    let path = root.join(PROFILES).join(id.to_string());
    if !path.join(HISTORY).is_file() {
        return Err(format!(
            "The selected profile is missing its history database: {}",
            path.display()
        ));
    }
    Ok(path)
}

fn write_selection(root: &Path, selection: &ProfileSelection) -> Result<(), String> {
    let mut marker = NamedTempFile::new_in(root).map_err(|e| e.to_string())?;
    serde_json::to_writer(marker.as_file_mut(), selection).map_err(|e| e.to_string())?;
    marker.as_file().sync_all().map_err(|e| e.to_string())?;
    marker
        .persist(root.join(ACTIVE))
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn activate_profile(root: &Path) -> Result<PathBuf, String> {
    let mut selection = read_selection(root)?;
    if let Some(id) = selection.pending.take() {
        let path = profile_path(root, &id)?;
        if !path.join(HISTORY).is_file() {
            return Err("Pending profile is missing its history database".into());
        }
        selection.previous = Some(std::mem::replace(&mut selection.active, id));
        write_selection(root, &selection)?;
        return Ok(path);
    }
    profile_path(root, &selection.active)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileStatus {
    pending: bool,
    has_previous: bool,
}

pub fn profile_status(root: &Path) -> Result<ProfileStatus, String> {
    let selection = read_selection(root)?;
    Ok(ProfileStatus {
        pending: selection.pending.is_some(),
        has_previous: selection.previous.is_some(),
    })
}

pub fn cancel_restore(root: &Path) -> Result<(), String> {
    let _guard = RESTORE_LOCK.lock().map_err(|e| e.to_string())?;
    let mut selection = read_selection(root)?;
    selection.pending = None;
    write_selection(root, &selection)
}

pub fn stage_previous(root: &Path) -> Result<(), String> {
    let _guard = RESTORE_LOCK.lock().map_err(|e| e.to_string())?;
    let mut selection = read_selection(root)?;
    if selection.pending.is_some() {
        return Err("A profile switch is already pending".into());
    }
    let id = selection
        .previous
        .clone()
        .ok_or("No previous profile is available")?;
    if !profile_path(root, &id)?.join(HISTORY).is_file() {
        return Err("Previous profile is missing its history database".into());
    }
    selection.pending = Some(id);
    write_selection(root, &selection)
}

fn export(
    profile: &Path,
    destination: &Path,
    before_snapshot: impl FnOnce(),
) -> Result<(), Box<dyn std::error::Error>> {
    let parent = destination.parent().ok_or("Select a backup destination")?;
    let staging = TempDir::new_in(parent)?;
    let mut settings = Vec::new();
    // Draft removal follows successful history recording. Capture the draft first
    // so a prompt recorded during export cannot be absent from both copies.
    for name in [WORKSPACE, PROVIDERS] {
        match File::open(profile.join(name)) {
            Ok(file) => {
                let mut contents = Vec::new();
                file.take(SETTINGS_LIMIT + 1).read_to_end(&mut contents)?;
                if contents.len() as u64 > SETTINGS_LIMIT {
                    return Err(format!("{name} exceeds the 8 MB backup limit").into());
                }
                settings.push((name, contents));
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    before_snapshot();
    let snapshot = staging.path().join(HISTORY);
    {
        let source =
            Connection::open_with_flags(profile.join(HISTORY), OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let mut target = Connection::open(&snapshot)?;
        Backup::new(&source, &mut target)?.run_to_completion(
            256,
            Duration::from_millis(10),
            None,
        )?;
        target.execute_batch("PRAGMA journal_mode=DELETE;")?;
    }
    if snapshot.metadata()?.len() > HISTORY_LIMIT {
        return Err("History exceeds the 4 GB backup limit".into());
    }
    let mut archive_file = NamedTempFile::new_in(parent)?;
    let mut archive = ZipWriter::new(archive_file.as_file_mut());
    let options = SimpleFileOptions::default()
        .unix_permissions(0o600)
        .large_file(true);
    archive.start_file(MANIFEST, options)?;
    archive.write_all(manifest().to_string().as_bytes())?;
    archive.start_file(HISTORY, options)?;
    io::copy(&mut File::open(snapshot)?, &mut archive)?;
    for (name, contents) in settings {
        archive.start_file(name, options)?;
        archive.write_all(&contents)?;
    }
    archive.finish()?;
    archive_file.as_file().sync_all()?;
    archive_file.persist_noclobber(destination)?;
    Ok(())
}

fn extract(source: &Path, destination: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let mut archive = ZipArchive::new(File::open(source)?)?;
    let mut seen = HashSet::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index)?;
        let name = entry.name().to_owned();
        let limit = match name.as_str() {
            MANIFEST => 4096,
            HISTORY => HISTORY_LIMIT,
            PROVIDERS | WORKSPACE => SETTINGS_LIMIT,
            _ => return Err("Unexpected file in Agentrance backup".into()),
        };
        if !seen.insert(name.clone()) || entry.size() > limit {
            return Err("Duplicate or oversized file in Agentrance backup".into());
        }
        if name == MANIFEST {
            let mut raw = Vec::new();
            entry.take(limit + 1).read_to_end(&mut raw)?;
            if raw.len() as u64 > limit || serde_json::from_slice::<Value>(&raw)? != manifest() {
                return Err("Unsupported Agentrance backup format".into());
            }
        } else {
            let mut file = NamedTempFile::new_in(destination)?;
            if io::copy(&mut entry.take(limit + 1), file.as_file_mut())? > limit {
                return Err("Oversized file in Agentrance backup".into());
            }
            file.as_file().sync_all()?;
            file.persist_noclobber(destination.join(name))?;
        }
    }
    if !seen.contains(MANIFEST) || !seen.contains(HISTORY) {
        return Err("Backup is missing its manifest or history database".into());
    }
    let db = Connection::open(destination.join(HISTORY))?;
    db.execute_batch("PRAGMA trusted_schema=OFF;")?;
    if db.query_row("PRAGMA quick_check(1)", [], |row| row.get::<_, String>(0))? != "ok" {
        return Err("Backup history failed SQLite integrity validation".into());
    }
    db.prepare("SELECT id, provider, cwd FROM sessions LIMIT 0")?;
    db.prepare("SELECT session, kind, data FROM events LIMIT 0")?;
    crate::storage::initialize(&db)?;
    drop(db);
    if let Some(raw) = crate::settings::load(destination)? {
        crate::settings::save(destination, &raw)?;
    }
    if let Some(raw) = crate::workspace::load(destination)? {
        crate::workspace::validate_recovery(&raw)?;
    }
    Ok(())
}

fn stage_restore(
    root: &Path,
    current: &Path,
    archive: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let _guard = RESTORE_LOCK.lock().map_err(|error| error.to_string())?;
    let mut selection = read_selection(root)?;
    if selection.pending.is_some() || profile_path(root, &selection.active)? != current {
        return Err("A restore is already staged. Reopen Agentrance to use it.".into());
    }
    let profiles = root.join(PROFILES);
    fs::create_dir_all(&profiles)?;
    let staging = TempDir::new_in(&profiles)?;
    extract(archive, staging.path())?;

    let id = Uuid::new_v4().to_string();
    let restored = profiles.join(&id);
    fs::rename(staging.path(), &restored)?;
    selection.pending = Some(id);
    if let Err(error) = write_selection(root, &selection) {
        let _ = fs::remove_dir_all(restored);
        return Err(error.into());
    }
    Ok(())
}

pub fn create(profile: &Path, destination: &Path) -> Result<(), String> {
    export(profile, destination, || {}).map_err(|error| format!("Backup failed: {error}"))
}

pub fn restore(root: &Path, current: &Path, archive: &Path) -> Result<(), String> {
    stage_restore(root, current, archive).map_err(|error| format!("Restore failed: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn staged_restore_preserves_current_profile_and_committed_wal_data() {
        let temp = TempDir::new().unwrap();
        let root = temp.path();
        let db = Connection::open(root.join(HISTORY)).unwrap();
        crate::storage::initialize(&db).unwrap();
        db.execute_batch("PRAGMA wal_autocheckpoint=0; INSERT INTO sessions(id,provider,cwd) VALUES('one','Test','/original');").unwrap();
        crate::storage::append(&db, "one", "user", &json!("original"), 1).unwrap();
        let workspace = include_str!("../../tests/fixtures/backup-workspaces.json");
        crate::workspace::save(root, workspace).unwrap();

        let archive = root.join("backup.zip");
        export(root, &archive, || {
            // Simulate a send acknowledged after the draft was captured.
            crate::storage::append(&db, "one", "user", &json!("during export"), 2).unwrap();
            crate::workspace::save(root, &workspace.replace("unsent", "")).unwrap();
        })
        .unwrap();
        assert!(create(root, &archive).is_err());
        crate::storage::append(&db, "one", "user", &json!("newer"), 3).unwrap();
        restore(root, root, &archive).unwrap();
        assert!(profile_status(root).unwrap().pending);
        assert_eq!(read_selection(root).unwrap().active, "root");
        cancel_restore(root).unwrap();
        assert_eq!(activate_profile(root).unwrap(), root);
        restore(root, root, &archive).unwrap();
        let restored = activate_profile(root).unwrap();
        assert_ne!(restored, root);
        assert!(restore(root, root, &archive).is_err());
        let snapshot = Connection::open(restored.join(HISTORY)).unwrap();
        assert_eq!(
            crate::storage::messages(&snapshot, "one")
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            crate::storage::messages(&db, "one")
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            3
        );
        assert_eq!(
            crate::workspace::load(&restored).unwrap(),
            Some(workspace.to_owned())
        );
        assert!(profile_status(root).unwrap().has_previous);
        stage_previous(root).unwrap();
        assert_eq!(activate_profile(root).unwrap(), root);
        stage_previous(root).unwrap();
        assert_eq!(activate_profile(root).unwrap(), restored);
    }

    #[test]
    fn workspace_that_cannot_be_reopened_does_not_stage_a_restore() {
        let temp = TempDir::new().unwrap();
        let root = temp.path();
        let db = Connection::open(root.join(HISTORY)).unwrap();
        crate::storage::initialize(&db).unwrap();
        crate::workspace::save(root, r#"{"version":1}"#).unwrap();
        let archive = root.join("invalid-workspace.zip");
        create(root, &archive).unwrap();
        assert!(restore(root, root, &archive)
            .unwrap_err()
            .contains("Invalid workspace recovery"));
        assert!(!profile_status(root).unwrap().pending);
    }

    #[test]
    fn corrupted_archive_leaves_profile_selection_alone() {
        let temp = TempDir::new().unwrap();
        let root = temp.path();
        let archive = root.join("invalid.zip");
        fs::write(&archive, b"not an archive").unwrap();
        assert!(restore(root, root, &archive).is_err());
        assert_eq!(activate_profile(root).unwrap(), root);
    }
}
