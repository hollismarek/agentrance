use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::{io::AsyncReadExt, process::Command};

const STATUS_LIMIT: usize = 12 * 1024;
const DIFF_LIMIT: usize = 32 * 1024;

#[derive(Serialize)]
pub struct ProjectBrief {
    cwd: String,
    baseline: Option<String>,
    status: String,
    diff: Option<TrackedDiff>,
}

#[derive(Serialize)]
struct TrackedDiff {
    staged: String,
    unstaged: String,
}

struct Git {
    executable: PathBuf,
    cwd: String,
    overrides: Vec<String>,
}

impl Git {
    async fn run(&self, args: &[&str], limit: usize) -> Result<(i32, String), String> {
        let mut command = Command::new(&self.executable);
        command
            .current_dir(&self.cwd)
            .env_remove("GIT_DIR")
            .env_remove("GIT_WORK_TREE")
            .env_remove("GIT_INDEX_FILE")
            .env("GIT_TERMINAL_PROMPT", "0")
            .args([
                "--no-optional-locks",
                "--no-pager",
                "-c",
                "core.fsmonitor=false",
            ])
            .args(&self.overrides)
            .args(args)
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .stdout(Stdio::piped())
            .kill_on_drop(true);
        let mut child = command
            .spawn()
            .map_err(|e| format!("Could not start Git: {e}"))?;
        let stdout = child.stdout.take().ok_or("Git output is unavailable")?;
        let mut bytes = Vec::new();
        stdout
            .take((limit + 1) as u64)
            .read_to_end(&mut bytes)
            .await
            .map_err(|e| format!("Could not read Git output: {e}"))?;
        if bytes.len() > limit {
            return Err("Git output exceeds the project brief limit. Turn off the optional diff if selected.".into());
        }
        let status = child
            .wait()
            .await
            .map_err(|e| format!("Could not finish Git: {e}"))?;
        let output = String::from_utf8(bytes).map_err(|_| "Git output contains non-UTF-8 data")?;
        Ok((status.code().unwrap_or(-1), output))
    }

    async fn read(&self, args: &[&str], limit: usize) -> Result<String, String> {
        match self.run(args, limit).await? {
            (0, output) => Ok(output),
            _ => Err("Git could not read the selected project. Check that it is a Git working tree accessible to Agentrance.".into()),
        }
    }

    async fn brief(mut self, include_diff: bool) -> Result<ProjectBrief, String> {
        // Status and diff can run configured clean filters when inspecting the
        // worktree. Disable them, along with external diff and text conversion.
        let (code, keys) = self
            .run(
                &[
                    "config",
                    "--name-only",
                    "--get-regexp",
                    r"^filter\..*\.(clean|process|required)$",
                ],
                STATUS_LIMIT,
            )
            .await?;
        if code != 0 && code != 1 {
            return Err("Could not read Git filter configuration".into());
        }
        for key in keys.lines() {
            let (driver, field) = key
                .rsplit_once('.')
                .ok_or("Could not read Git filter configuration")?;
            if !driver.starts_with("filter.")
                || !matches!(field, "clean" | "process" | "required")
                || key.contains('=')
            {
                return Err("Unsupported Git filter configuration".into());
            }
            let value = if field == "required" { "false" } else { "" };
            self.overrides
                .extend(["-c".into(), format!("{key}={value}")]);
        }

        let baseline = match self
            .run(&["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], 128)
            .await?
        {
            (0, hash) => Some(hash.trim().to_owned()),
            (1, _) => None,
            _ => return Err("Could not read the Git baseline".into()),
        };
        let status = self
            .read(
                &[
                    "status",
                    "--porcelain=v1",
                    "--untracked-files=all",
                    "--ignore-submodules=all",
                    "--",
                    ".",
                ],
                STATUS_LIMIT,
            )
            .await?;
        let diff = if include_diff {
            let common = [
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--no-color",
                "--ignore-submodules=all",
                "--relative",
            ];
            let mut staged_args = common.to_vec();
            staged_args.push("--cached");
            if let Some(commit) = baseline.as_deref() {
                staged_args.push(commit);
            }
            staged_args.extend(["--", "."]);
            let staged = self.read(&staged_args, DIFF_LIMIT).await?;
            let mut unstaged_args = common.to_vec();
            unstaged_args.extend(["--", "."]);
            let unstaged = self.read(&unstaged_args, DIFF_LIMIT - staged.len()).await?;
            Some(TrackedDiff { staged, unstaged })
        } else {
            None
        };
        Ok(ProjectBrief {
            cwd: self.cwd,
            baseline,
            status,
            diff,
        })
    }
}

#[tauri::command]
pub async fn collect_project_brief(
    path: String,
    include_diff: bool,
) -> Result<ProjectBrief, String> {
    let cwd = crate::platform::project_directory(Path::new(&path))?;
    let name = if cfg!(windows) { "git.exe" } else { "git" };
    let path = std::env::var_os("PATH").unwrap_or_default();
    let executable = std::env::split_paths(&path)
        .filter(|path| path.is_absolute())
        .map(|path| path.join(name))
        .find(|path| crate::platform::runnable(path))
        .ok_or("Git was not found on Agentrance’s PATH")?;
    tokio::time::timeout(
        Duration::from_secs(8),
        Git {
            executable,
            cwd,
            overrides: Vec::new(),
        }
        .brief(include_diff),
    )
    .await
    .map_err(|_| "Git took too long to collect the project brief")?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, process::Command};

    #[tokio::test]
    async fn collects_only_selected_project_and_never_runs_repo_filters() {
        let repo = tempfile::tempdir().unwrap();
        let git = |args: &[&str]| {
            let output = Command::new("git")
                .current_dir(repo.path())
                .args(args)
                .output()
                .unwrap();
            assert!(output.status.success(), "Git {args:?}: {:?}", output.stderr);
        };
        git(&["init"]);
        fs::create_dir(repo.path().join("project")).unwrap();
        fs::write(repo.path().join("project/file.txt"), "original\n").unwrap();
        fs::write(repo.path().join("outside.txt"), "outside\n").unwrap();
        fs::write(repo.path().join(".gitattributes"), "*.txt filter=example\n").unwrap();
        git(&["add", "."]);
        git(&[
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.invalid",
            "-c",
            "commit.gpgSign=false",
            "commit",
            "-m",
            "Baseline",
        ]);
        fs::write(repo.path().join("project/file.txt"), "staged edit\n").unwrap();
        git(&["add", "project/file.txt"]);
        git(&[
            "config",
            "filter.example.clean",
            "echo ran > filter-ran; cat",
        ]);
        git(&["config", "filter.example.required", "true"]);
        fs::write(repo.path().join("project/file.txt"), "original\n").unwrap();
        fs::write(repo.path().join("outside.txt"), "outside change\n").unwrap();
        fs::write(repo.path().join("project/new.txt"), "untracked contents\n").unwrap();

        let project = repo.path().join("project").to_string_lossy().into_owned();
        let summary = collect_project_brief(project.clone(), false).await.unwrap();
        assert!(summary.baseline.is_some());
        assert!(summary.status.contains("file.txt"));
        assert!(summary.status.contains("new.txt"));
        assert!(!summary.status.contains("outside.txt"));
        assert!(summary.diff.is_none());
        let diff = collect_project_brief(project, true)
            .await
            .unwrap()
            .diff
            .unwrap();
        assert!(summary.status.contains("MM project/file.txt"));
        assert!(diff.staged.contains("+staged edit"));
        assert!(diff.unstaged.contains("+original"));
        for patch in [&diff.staged, &diff.unstaged] {
            assert!(!patch.contains("untracked contents"));
            assert!(!patch.contains("outside change"));
        }
        assert!(!repo.path().join("filter-ran").exists());
    }
}
