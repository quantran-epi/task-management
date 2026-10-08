use std::path::{Path, PathBuf};
use crate::agent_manager::hidden_std_command;

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
