//! Bounded filesystem discovery only. Never execute, authenticate or install a CLI.
use crate::{platform::runnable, Provider};
use std::io::Read;
use std::path::{Path, PathBuf};

fn push(dirs: &mut Vec<PathBuf>, path: PathBuf) {
    if dirs.len() < 256 && path.is_absolute() && !dirs.contains(&path) {
        dirs.push(path)
    }
}
fn version_bins(dirs: &mut Vec<PathBuf>, root: PathBuf) {
    if let Ok(entries) = std::fs::read_dir(root) {
        let mut paths: Vec<_> = entries
            .take(64)
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        paths.sort();
        paths.reverse();
        for path in paths.into_iter().take(32) {
            push(dirs, path.join("bin"))
        }
    }
}
fn search_dirs(home: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            push(&mut dirs, dir)
        }
    }
    for sub in [".local/bin", ".cargo/bin", ".npm-global/bin", ".volta/bin"] {
        push(&mut dirs, home.join(sub))
    }
    #[cfg(not(windows))]
    for path in ["/usr/local/bin", "/usr/bin", "/opt/homebrew/bin"] {
        push(&mut dirs, PathBuf::from(path))
    }
    #[cfg(windows)]
    {
        for (key, sub) in [
            ("APPDATA", "npm"),
            ("ProgramFiles", "nodejs"),
            ("LOCALAPPDATA", "Programs/nodejs"),
        ] {
            if let Some(root) = std::env::var_os(key) {
                push(&mut dirs, PathBuf::from(root).join(sub))
            }
        }
    }
    version_bins(&mut dirs, home.join(".local/share/mise/installs/node"));
    version_bins(&mut dirs, home.join(".nvm/versions/node"));
    dirs
}
fn native(dirs: &[PathBuf], name: &str) -> Option<PathBuf> {
    dirs.iter()
        .map(|dir| {
            dir.join(if cfg!(windows) {
                format!("{name}.exe")
            } else {
                name.into()
            })
        })
        .find(|p| runnable(p))
}
fn node(dirs: &[PathBuf], preferred: &Path) -> Option<PathBuf> {
    native(&[preferred.to_path_buf()], "node").or_else(|| native(dirs, "node"))
}
fn candidate(id: &str, name: &str, executable: PathBuf, args: Vec<String>) -> Option<Provider> {
    Some(Provider {
        id: id.into(),
        name: name.into(),
        executable: executable.into_os_string().into_string().ok()?,
        args,
        env: Default::default(),
        cwd: String::new(),
    })
}
fn npm_entry_for(package: &Path, names: &[&str], command: &str) -> Option<PathBuf> {
    let manifest = package.join("package.json");
    let metadata = manifest.metadata().ok()?;
    if !metadata.is_file() || metadata.len() > 65536 {
        return None;
    }
    let mut bytes = Vec::new();
    std::fs::File::open(manifest)
        .ok()?
        .take(65537)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() > 65536 {
        return None;
    }
    let json: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    if !json["name"]
        .as_str()
        .is_some_and(|name| names.contains(&name))
    {
        return None;
    }
    let bin = json["bin"]
        .as_str()
        .or_else(|| json["bin"][command].as_str())?;
    let entry = dunce::canonicalize(package.join(bin)).ok()?;
    if !entry.starts_with(dunce::canonicalize(package).ok()?) || !entry.is_file() {
        return None;
    }
    match entry.extension().and_then(|e| e.to_str()) {
        Some("js" | "mjs" | "cjs") => Some(entry),
        _ => None,
    }
}
fn npm_entry(package: &Path) -> Option<PathBuf> {
    npm_entry_for(
        package,
        &[
            "@agentclientprotocol/codex-acp",
            "@zed-industries/codex-acp",
        ],
        "codex-acp",
    )
}
pub fn discover(home: &Path) -> Vec<Provider> {
    discover_in(&search_dirs(home))
}
fn discover_in(dirs: &[PathBuf]) -> Vec<Provider> {
    let mut found = Vec::new();
    for (id, name, args, package) in [
        (
            "gemini",
            "Gemini CLI",
            vec!["--acp"],
            Some("@google/gemini-cli"),
        ),
        ("opencode", "OpenCode", vec!["acp"], None),
        (
            "copilot",
            "GitHub Copilot CLI",
            vec!["--acp", "--stdio"],
            Some("@github/copilot"),
        ),
    ] {
        let mut launch = None;
        if let Some(package) = package {
            for dir in dirs {
                if let Some(runtime) = node(dirs, dir) {
                    for base in [
                        dir.join("node_modules"),
                        dir.parent().unwrap_or(dir).join("lib/node_modules"),
                    ] {
                        if let Some(entry) = npm_entry_for(&base.join(package), &[package], id) {
                            let mut arguments = vec![entry.to_string_lossy().into_owned()];
                            arguments.extend(args.iter().map(|v| v.to_string()));
                            launch = candidate(id, name, runtime.clone(), arguments);
                            break;
                        }
                    }
                }
                if launch.is_some() {
                    break;
                }
            }
        }
        if launch.is_none() {
            if let Some(exe) = native(dirs, id) {
                launch = candidate(id, name, exe, args.iter().map(|v| v.to_string()).collect())
            }
        }
        if let Some(provider) = launch {
            found.push(provider)
        }
    }

    if let Some(exe) = native(dirs, "kiro-cli") {
        if let Some(p) = candidate(
            "kiro",
            "Kiro CLI",
            exe,
            vec!["acp".into(), "--agent-engine=v3".into()],
        ) {
            found.push(p)
        }
    }
    // Prefer an explicit node + JS entry for npm adapters; it also works on Windows
    // without invoking .cmd wrappers, and avoids GUI shebang PATH surprises.
    for dir in dirs {
        if let Some(runtime) = node(dirs, dir) {
            for scope in ["@agentclientprotocol", "@zed-industries"] {
                for base in [
                    dir.join("node_modules"),
                    dir.parent().unwrap_or(dir).join("lib/node_modules"),
                ] {
                    if let Some(entry) = npm_entry(&base.join(scope).join("codex-acp")) {
                        if let Some(p) = candidate(
                            "codex-acp",
                            "Codex (ACP)",
                            runtime.clone(),
                            vec![entry.to_string_lossy().into_owned()],
                        ) {
                            found.push(p);
                            return found;
                        }
                    }
                }
            }
        }
    }
    if let Some(exe) = native(dirs, "codex-acp") {
        let target = dunce::canonicalize(&exe).unwrap_or_else(|_| exe.clone());
        let is_js = matches!(
            target.extension().and_then(|e| e.to_str()),
            Some("js" | "mjs" | "cjs")
        );
        let launch = if is_js {
            node(dirs, exe.parent().unwrap_or(Path::new("/"))).and_then(|runtime| {
                candidate(
                    "codex-acp",
                    "Codex (ACP)",
                    runtime,
                    vec![target.to_string_lossy().into_owned()],
                )
            })
        } else {
            candidate("codex-acp", "Codex (ACP)", exe, vec![])
        };
        if let Some(p) = launch {
            found.push(p)
        }
    }
    found
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fake(path: &Path, body: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
    }
    fn binary(dir: &Path, name: &str) -> PathBuf {
        dir.join(if cfg!(windows) {
            format!("{name}.exe")
        } else {
            name.into()
        })
    }
    #[test]
    fn discovery_reads_metadata_without_running_providers_or_confusing_plain_codex() {
        let root =
            std::env::temp_dir().join(format!("agentrance-discovery-{}", uuid::Uuid::new_v4()));
        let bin = root.join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        fake(&binary(&bin, "codex"), "not executable code");
        assert!(discover_in(&[bin.clone()]).is_empty());
        fake(&binary(&bin, "kiro-cli"), "not executable code");
        fake(&binary(&bin, "codex-acp"), "not executable code");
        let found = discover_in(&[bin.clone()]);
        assert_eq!(found.len(), 2);
        assert_eq!(found[0].args, ["acp", "--agent-engine=v3"]);
        assert!(found.iter().all(|p| p.env.is_empty() && p.cwd.is_empty()));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn discovers_three_native_acp_launch_modes_without_execution() {
        let root = std::env::temp_dir().join(format!("agentrance-native-{}", uuid::Uuid::new_v4()));
        for name in ["gemini", "opencode", "copilot"] {
            fake(&binary(&root, name), "not executable code")
        }
        let found = discover_in(&[root.clone()]);
        assert_eq!(found.len(), 3);
        assert_eq!(found[0].args, ["--acp"]);
        assert_eq!(found[1].args, ["acp"]);
        assert_eq!(found[2].args, ["--acp", "--stdio"]);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn gemini_and_copilot_npm_bin_keys_and_args_are_preserved() {
        let root =
            std::env::temp_dir().join(format!("agentrance-npm-extra-{}", uuid::Uuid::new_v4()));
        let bin = root.join("bin");
        fake(&binary(&bin, "node"), "not executable code");
        for (package, command, entry) in [
            ("@google/gemini-cli", "gemini", "dist/index.js"),
            ("@github/copilot", "copilot", "npm-loader.js"),
        ] {
            let dir = root.join("lib/node_modules").join(package);
            fake(&dir.join(entry), "not executable code");
            let manifest = serde_json::json!({"name":package,"bin":{command:entry}});
            fake(&dir.join("package.json"), &manifest.to_string());
        }
        let found = discover_in(&[bin]);
        assert_eq!(found.len(), 2);
        assert!(found[0].args[0].ends_with("index.js"));
        assert_eq!(found[0].args[1], "--acp");
        assert!(found[1].args[0].ends_with("npm-loader.js"));
        assert_eq!(&found[1].args[1..], ["--acp", "--stdio"]);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn npm_detection_requires_node_and_a_contained_documented_entry() {
        let root = std::env::temp_dir().join(format!("agentrance-npm-{}", uuid::Uuid::new_v4()));
        let bin = root.join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let package = root.join("lib/node_modules/@agentclientprotocol/codex-acp");
        fake(
            &package.join("dist/index.js"),
            "throw new Error('must not execute')",
        );
        fake(
            &package.join("package.json"),
            r#"{"name":"@agentclientprotocol/codex-acp","bin":{"codex-acp":"dist/index.js"}}"#,
        );
        assert!(discover_in(&[bin.clone()]).is_empty());
        fake(&binary(&bin, "node"), "not executable code");
        let found = discover_in(&[bin.clone()]);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].executable, binary(&bin, "node").to_str().unwrap());
        assert!(found[0].args[0].ends_with("index.js"));
        fake(
            &package.join("package.json"),
            r#"{"name":"@agentclientprotocol/codex-acp","bin":"../../escape.js"}"#,
        );
        fake(&package.join("../../escape.js"), "not executable code");
        assert!(discover_in(&[bin]).is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }
}
