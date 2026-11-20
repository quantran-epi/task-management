use serde::Serialize;
use std::io::Read;
use std::path::{Path, PathBuf};
use crate::agent_manager::hidden_std_command;
use crate::ssh_service::{connect_and_auth, SshConfig};

#[tauri::command]
pub async fn list_worktree_files(worktree_path: String) -> Result<Vec<String>, String> {
    let path = PathBuf::from(&worktree_path);
    if !path.exists() {
        return Err(format!("Worktree path does not exist: {}", worktree_path));
    }

    // git ls-files --cached --others --exclude-standard
    let output = hidden_std_command("git")
        .current_dir(&path)
        .args(["ls-files", "--cached", "--others", "--exclude-standard"])
        .output()
        .map_err(|e| format!("Failed to list worktree files: {}", e))?;

    if !output.status.success() {
        return Err(format!("git ls-files failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let files: Vec<String> = stdout_str
        .lines()
        .map(|l| l.trim().replace('\\', "/"))
        .filter(|l| !l.is_empty())
        .collect();

    Ok(files)
}

#[tauri::command]
pub async fn read_worktree_file_content(worktree_path: String, file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&worktree_path);
    if !path.exists() {
        return Err(format!("Worktree path does not exist: {}", worktree_path));
    }

    let canonical_worktree = path.canonicalize().map_err(|e| e.to_string())?;

    let relative = Path::new(&file_path);
    if file_path.contains("..") || relative.is_absolute() {
        return Err("Path traversal attempt detected".to_string());
    }

    let full_target = path.join(&file_path);
    if !full_target.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let canonical_target = full_target.canonicalize().map_err(|e| e.to_string())?;
    if !canonical_target.starts_with(&canonical_worktree) {
        return Err("Path traversal attempt detected".to_string());
    }

    let metadata = std::fs::metadata(&canonical_target).map_err(|e| e.to_string())?;
    if metadata.len() > 5 * 1024 * 1024 {
        return Err("File too large (>5MB)".to_string());
    }

    std::fs::read_to_string(&canonical_target).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub async fn revert_hunk_diff(worktree_path: String, patch_content: String) -> Result<(), String> {
    let path = PathBuf::from(&worktree_path);
    if !path.exists() {
        return Err(format!("Worktree path does not exist: {}", worktree_path));
    }

    use std::io::Write;
    let mut child = hidden_std_command("git")
        .current_dir(&path)
        .args(["apply", "--reverse", "--unidiff-zero", "-"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn git apply: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(patch_content.as_bytes())
            .map_err(|e| format!("Failed to write patch to git apply stdin: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for git apply: {}", e))?;

    if !output.status.success() {
        // Fallback without --unidiff-zero if version or format differs
        let mut fallback = hidden_std_command("git")
            .current_dir(&path)
            .args(["apply", "--reverse", "-"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn git apply: {}", e))?;

        if let Some(mut stdin) = fallback.stdin.take() {
            let _ = stdin.write_all(patch_content.as_bytes());
        }

        let fb_out = fallback.wait_with_output().map_err(|e| e.to_string())?;
        if !fb_out.status.success() {
            return Err(format!("git apply --reverse failed: {}", String::from_utf8_lossy(&fb_out.stderr)));
        }
    }

    Ok(())
}

// -------------------------------------------------------------------------------------------------
// Phase 48 — SSH-native Agent Developer worktree provisioning.
// No local fs / local git touches the worktree path: every command runs on the remote via SSH.
// -------------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeDescriptor {
    pub ssh_config_id: String,
    pub remote_repo_path: String,
    pub remote_worktree_path: String,
    pub branch: String,
    pub base_ref: Option<String>,
}

/// Must stay byte-for-byte identical to the TS `deriveRemoteWorktreePath` sanitizer.
fn worktree_safe_id(session_key: &str) -> String {
    session_key
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '-' })
        .take(40)
        .collect()
}

fn derive_remote_worktree_path(remote_repo_path: &str, session_key: &str) -> String {
    let root = remote_repo_path.trim().trim_end_matches('/');
    format!("{}/.taskmate-worktrees/agent-developer-{}", root, worktree_safe_id(session_key))
}

fn derive_worktree_branch(session_key: &str) -> String {
    format!("taskmate/agent-developer-{}", worktree_safe_id(session_key))
}

/// Single-quote an argument for the remote shell. Mirrors `shellQuote` in sshFsToolService.
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

struct RemoteOutput {
    stdout: String,
    stderr: String,
    exit_status: i32,
}

/// Blocking SSH command. `build_remote_command` carries the payload as base64 so quoted
/// arguments and `$()` survive intact. Never called with a local path.
fn exec_remote(
    config: &SshConfig,
    secret: Option<&str>,
    command: &str,
) -> Result<RemoteOutput, String> {
    let session = connect_and_auth(config, secret)?;
    let mut channel = session
        .channel_session()
        .map_err(|e| format!("Không thể mở SSH channel: {}", e))?;
    let remote_command = crate::tool_cancel::build_remote_command(command);
    channel
        .exec(&remote_command)
        .map_err(|e| format!("Thực thi lệnh thất bại: {}", e))?;
    let mut stdout = String::new();
    let mut stderr = String::new();
    channel
        .read_to_string(&mut stdout)
        .map_err(|e| format!("Đọc stdout thất bại: {}", e))?;
    channel
        .stderr()
        .read_to_string(&mut stderr)
        .map_err(|e| format!("Đọc stderr thất bại: {}", e))?;
    let exit_status = channel.exit_status().unwrap_or(1) as i32;
    Ok(RemoteOutput { stdout, stderr, exit_status })
}

#[tauri::command]
pub async fn ssh_worktree_provision(
    config: SshConfig,
    secret: Option<String>,
    remote_repo_path: String,
    session_key: String,
    base_ref: Option<String>,
) -> Result<WorktreeDescriptor, String> {
    let repo = remote_repo_path.trim().trim_end_matches('/').to_string();
    if repo.is_empty() {
        return Err("Đường dẫn repo remote trống.".to_string());
    }
    let worktree_path = derive_remote_worktree_path(&repo, &session_key);
    let branch = derive_worktree_branch(&session_key);
    let explicit_base = base_ref.filter(|s| !s.trim().is_empty());
    let base = explicit_base.clone().unwrap_or_else(|| "HEAD".to_string());

    let list = exec_remote(
        &config,
        secret.as_deref(),
        &format!("git -C {} worktree list --porcelain", shell_quote(&repo)),
    )?;
    if list.exit_status != 0 {
        return Err(format!("git worktree list thất bại: {}", list.stderr.trim()));
    }
    let registered = list
        .stdout
        .lines()
        .any(|line| line.trim() == format!("worktree {}", worktree_path));

    if !registered {
        let add = exec_remote(
            &config,
            secret.as_deref(),
            &format!(
                "git -C {} worktree add -b {} {} {}",
                shell_quote(&repo),
                shell_quote(&branch),
                shell_quote(&worktree_path),
                shell_quote(&base)
            ),
        )?;
        if add.exit_status != 0 {
            return Err(format!("git worktree add thất bại: {}", add.stderr.trim()));
        }
    }

    // realpath both, literal directory boundary, and exact deterministic path. Exit 77 is a
    // policy refusal. Appending '/' preserves trailing newlines through command substitution.
    let verify = format!(
        "root=$(realpath -- {} && printf /) || exit 1; root=${{root%?}}; root=${{root%?}}; \
         wt=$(realpath -- {} && printf /) || exit 1; wt=${{wt%?}}; wt=${{wt%?}}; \
         expected=${{root%/}}/.taskmate-worktrees/agent-developer-{}; \
         [ \"$wt\" = \"$expected\" ] || exit 77; \
         case \"$wt\" in \"${{root%/}}/\"*) printf %s \"$wt\" ;; *) exit 78 ;; esac",
        shell_quote(&repo),
        shell_quote(&worktree_path),
        worktree_safe_id(&session_key)
    );
    let checked = exec_remote(&config, secret.as_deref(), &verify)?;
    if checked.exit_status == 77 {
        return Err("Worktree path nằm ngoài repo hoặc sai quy ước deterministic.".to_string());
    }
    if checked.exit_status != 0 || checked.stdout.trim() != worktree_path {
        return Err(format!(
            "Không xác thực được worktree remote: {}",
            checked.stderr.trim()
        ));
    }

    Ok(WorktreeDescriptor {
        ssh_config_id: config.id,
        remote_repo_path: repo,
        remote_worktree_path: worktree_path,
        branch,
        base_ref: explicit_base,
    })
}
