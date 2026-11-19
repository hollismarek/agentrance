use crate::Provider;
use std::path::{Path, PathBuf};

pub fn project_directory(path: &Path) -> Result<String, String> {
    if !path.is_absolute() || !path.is_dir() {
        return Err("Choose an existing absolute project folder; the selected folder is missing or invalid".into());
    }
    // dunce preserves verbatim paths when necessary, normalizing them only when safe.
    dunce::canonicalize(path)
        .map_err(|e| format!("Cannot access project directory '{}': {e}", path.display()))?
        .into_os_string()
        .into_string()
        .map_err(|_| "The project path is not valid Unicode".into())
}

pub(crate) fn runnable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        path.metadata()
            .is_ok_and(|m| m.permissions().mode() & 0o111 != 0)
    }
    #[cfg(not(unix))]
    {
        true
    }
}

pub fn provider_executable(provider: &Provider) -> Result<PathBuf, String> {
    let configured = Path::new(&provider.executable);
    let resolved = if configured.is_absolute() {
        configured.to_path_buf()
    } else {
        // Relative executable paths depend on launch CWD. Require an absolute path
        // or a bare name searched only in explicit, absolute PATH directories.
        if provider.executable.contains(['/', '\\']) {
            return Err("Provider executable must be an absolute path or a name on PATH. Update Settings.".into());
        }
        let path = provider
            .env
            .iter()
            .find(|(key, _)| {
                if cfg!(windows) {
                    key.eq_ignore_ascii_case("PATH")
                } else {
                    key.as_str() == "PATH"
                }
            })
            .map(|(_, value)| std::ffi::OsString::from(value))
            .or_else(|| std::env::var_os("PATH"))
            .unwrap_or_default();
        let mut found = None;
        for directory in std::env::split_paths(&path).filter(|p| p.is_absolute()) {
            let candidate = directory.join(configured);
            #[cfg(windows)]
            let candidates = if configured.extension().is_none() {
                vec![
                    candidate.with_extension("exe"),
                    candidate.with_extension("com"),
                    candidate.with_extension("cmd"),
                    candidate.with_extension("bat"),
                ]
            } else {
                vec![candidate]
            };
            #[cfg(not(windows))]
            let candidates = vec![candidate];
            if let Some(candidate) = candidates.into_iter().find(|p| runnable(p)) {
                found = Some(candidate);
                break;
            }
        }
        found.ok_or_else(|| format!("Cannot find provider executable '{}'. Install the provider CLI, then set its absolute executable path in Menu → Settings. Desktop apps may have a different PATH than your terminal.",provider.executable))?
    };
    #[cfg(windows)]
    if resolved
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("cmd") || e.eq_ignore_ascii_case("bat"))
    {
        return Err("Windows .cmd/.bat wrappers are not launched through a shell. For an npm-installed provider, set executable to the absolute path to node.exe and put the provider's JavaScript entry file first in args. Native .exe providers can be configured directly.".into());
    }
    if !runnable(&resolved) {
        return Err(format!("Provider executable '{}' is missing or not executable. Update Menu → Settings with an installed CLI's absolute path.",resolved.display()));
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn provider(executable: String) -> Provider {
        Provider {
            id: "test".into(),
            name: "Test".into(),
            executable,
            args: vec![],
            env: Default::default(),
            cwd: std::env::temp_dir().to_string_lossy().into_owned(),
        }
    }
    #[test]
    fn resolves_absolute_executable_and_explicit_path_without_shell_interpretation() {
        let exe = std::env::current_exe().unwrap();
        assert_eq!(
            provider_executable(&provider(exe.to_string_lossy().into_owned())).unwrap(),
            exe
        );
        let mut p = provider(exe.file_name().unwrap().to_string_lossy().into_owned());
        p.env.insert(
            "PATH".into(),
            std::env::join_paths([exe.parent().unwrap()])
                .unwrap()
                .into_string()
                .unwrap(),
        );
        assert_eq!(provider_executable(&p).unwrap(), exe);
        assert!(provider_executable(&provider("relative/provider".into()))
            .unwrap_err()
            .contains("absolute path"));
        p.executable = "missing-provider-unique;echo secret".into();
        assert!(provider_executable(&p)
            .unwrap_err()
            .contains("Cannot find provider"));
    }
    #[test]
    fn project_paths_support_spaces_unicode_and_reject_missing_roots() {
        let root =
            std::env::temp_dir().join(format!("agentrance project ü {}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let normalized = project_directory(&root).unwrap();
        assert_eq!(
            dunce::canonicalize(&root).unwrap(),
            PathBuf::from(&normalized)
        );
        assert!(project_directory(&root.join("missing")).is_err());
        assert!(project_directory(Path::new(".")).is_err());
        #[cfg(windows)]
        assert_eq!(
            project_directory(&std::fs::canonicalize(&root).unwrap()).unwrap(),
            normalized
        );
        #[cfg(windows)]
        assert!(
            !normalized.starts_with(r"\\?\"),
            "ordinary paths should be provider-compatible"
        );
        std::fs::remove_dir(root).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn batch_wrappers_get_actionable_error() {
        assert!(provider_executable(&provider(r"C:\provider.cmd".into()))
            .unwrap_err()
            .contains("node.exe"));
    }
}
