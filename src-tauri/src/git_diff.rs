use crate::project_brief::{Git, GIT_TIMEOUT};
use serde::{Deserialize, Serialize};
use std::path::{Component, Path};

const FILE_LIST_LIMIT: usize = 64 * 1024;
const PATCH_LIMIT: usize = 256 * 1024;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Staged,
    Unstaged,
    Commit,
}

#[derive(Serialize)]
struct ChangedFile {
    status: String,
    path: String,
}

#[derive(Serialize)]
pub struct DiffFiles {
    cwd: String,
    commit: Option<String>,
    files: Vec<ChangedFile>,
}

async fn resolve_commit(git: &Git, revision: Option<&str>) -> Result<String, String> {
    let revision = revision
        .map(str::trim)
        .filter(|revision| !revision.is_empty())
        .unwrap_or("HEAD");
    if revision.len() > 1024 || revision.contains('\0') {
        return Err("Enter a valid Git commit or ref".into());
    }
    let object = format!("{revision}^{{commit}}");
    let (code, hash) = git
        .run(&["rev-parse", "--verify", "--end-of-options", &object], 128)
        .await?;
    let hash = hash.trim();
    if code != 0
        || !matches!(hash.len(), 40 | 64)
        || !hash.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("Git could not resolve that commit or ref in the selected project.".into());
    }
    Ok(hash.into())
}

async fn diff(
    git: &Git,
    source: Source,
    commit: Option<&str>,
    file: Option<&str>,
    limit: usize,
) -> Result<String, String> {
    let mut args = match source {
        Source::Staged => vec!["diff", "--cached"],
        Source::Unstaged => vec!["diff"],
        Source::Commit => vec!["show", "--format=", "--diff-merges=first-parent"],
    };
    // Literal paths and separate arguments keep file names and refs out of Git
    // option parsing. Renames appear as a deletion and an addition.
    args.extend([
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--relative",
        "--no-renames",
        "--ignore-submodules=all",
    ]);
    args.extend(if file.is_some() {
        ["--patch", "--unified=3"]
    } else {
        ["--name-status", "-z"]
    });
    if let Some(commit) = commit {
        args.push(commit);
    }
    args.extend(["--", file.unwrap_or(".")]);
    git.read(&args, limit).await
}

#[tauri::command]
pub async fn git_diff_files(
    path: String,
    source: Source,
    revision: Option<String>,
) -> Result<DiffFiles, String> {
    tokio::time::timeout(GIT_TIMEOUT, async {
        let git = Git::open(&path).await?;
        let commit = match source {
            Source::Commit => Some(resolve_commit(&git, revision.as_deref()).await?),
            _ => None,
        };
        let raw = diff(&git, source, commit.as_deref(), None, FILE_LIST_LIMIT).await?;
        let mut fields = raw.split_terminator('\0');
        let mut files = Vec::new();
        while let Some(status) = fields.next() {
            let path = fields
                .next()
                .ok_or("Git returned an incomplete file list")?;
            files.push(ChangedFile {
                status: status.into(),
                path: path.into(),
            });
        }
        Ok(DiffFiles {
            cwd: git.cwd,
            commit,
            files,
        })
    })
    .await
    .map_err(|_| "Git took too long to list changed files")?
}

#[tauri::command]
pub async fn git_diff_file(
    path: String,
    source: Source,
    commit: Option<String>,
    file: String,
) -> Result<String, String> {
    let path_components = Path::new(&file).components();
    if file.is_empty()
        || file.contains('\0')
        || !path_components
            .clone()
            .all(|part| matches!(part, Component::Normal(_)))
    {
        return Err("Select a file inside the project".into());
    }
    tokio::time::timeout(GIT_TIMEOUT, async {
        let git = Git::open(&path).await?;
        let commit = match source {
            Source::Commit => {
                let hash = commit
                    .as_deref()
                    .ok_or("Load a commit before opening a file")?;
                if !matches!(hash.len(), 40 | 64)
                    || !hash.bytes().all(|byte| byte.is_ascii_hexdigit())
                {
                    return Err("Load a commit before opening a file".into());
                }
                Some(hash)
            }
            _ => None,
        };
        diff(&git, source, commit, Some(&file), PATCH_LIMIT).await
    })
    .await
    .map_err(|_| "Git took too long to load that file’s diff")?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, process::Command};

    #[tokio::test]
    async fn lists_and_reads_separate_worktree_and_pinned_commit_diffs() {
        let repo = tempfile::tempdir().unwrap();
        let git = |args: &[&str]| {
            let output = Command::new("git")
                .current_dir(repo.path())
                .args(args)
                .output()
                .unwrap();
            assert!(output.status.success(), "Git {args:?}: {:?}", output.stderr);
        };
        let commit = |message| {
            git(&[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "-c",
                "commit.gpgSign=false",
                "commit",
                "-m",
                message,
            ])
        };
        git(&["init"]);
        let folder = repo.path().join("project");
        fs::create_dir(&folder).unwrap();
        let file = "a [literal].txt";
        let target = folder.join(file);
        fs::write(&target, "first\n").unwrap();
        fs::write(repo.path().join("outside.txt"), "outside\n").unwrap();
        git(&["add", "."]);
        commit("Initial");
        let path = folder.to_string_lossy().into_owned();
        let pinned = git_diff_files(path.clone(), Source::Commit, None)
            .await
            .unwrap();
        assert_eq!(pinned.files.len(), 1);
        assert_eq!(pinned.files[0].path, file);
        assert_eq!(pinned.files[0].status, "A");

        fs::write(&target, "second\n").unwrap();
        git(&["add", "."]);
        commit("Second");
        fs::write(&target, "staged\n").unwrap();
        git(&["add", "."]);
        fs::write(&target, "unstaged\n").unwrap();
        fs::write(folder.join("untracked.txt"), "ignored in diff").unwrap();

        let patch = git_diff_file(path.clone(), Source::Commit, pinned.commit, file.into())
            .await
            .unwrap();
        assert!(patch.contains("+first"));
        assert!(!patch.contains("second"));
        for (source, change) in [(Source::Staged, "+staged"), (Source::Unstaged, "+unstaged")] {
            let files = git_diff_files(path.clone(), source, None)
                .await
                .unwrap()
                .files;
            assert_eq!(files.len(), 1);
            assert_eq!(files[0].path, file);
            assert_eq!(files[0].status, "M");
            let patch = git_diff_file(path.clone(), source, None, file.into())
                .await
                .unwrap();
            assert!(patch.contains(change));
        }
        assert!(git_diff_file(
            path.clone(),
            Source::Unstaged,
            None,
            "../outside.txt".into()
        )
        .await
        .is_err());
        assert!(git_diff_files(path, Source::Commit, Some("--help".into()))
            .await
            .is_err());
    }
}
