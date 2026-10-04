use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraProxyResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
}

#[tauri::command]
pub async fn jira_proxy_request(
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<JiraProxyResponse, String> {
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let req_method = match method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        other => return Err(format!("Unsupported HTTP method: {}", other)),
    };

    let mut req_builder = client.request(req_method, &url);

    for (k, v) in headers {
        req_builder = req_builder.header(&k, &v);
    }

    if let Some(b) = body {
        req_builder = req_builder.body(b);
    }

    let response = req_builder
        .send()
        .await
        .map_err(|e| format!("Jira request failed: {}", e))?;

    let status = response.status().as_u16();

    let mut resp_headers = HashMap::new();
    for (k, v) in response.headers() {
        if let Ok(val_str) = v.to_str() {
            resp_headers.insert(k.as_str().to_string(), val_str.to_string());
        }
    }

    let body_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    Ok(JiraProxyResponse {
        status,
        headers: resp_headers,
        body: body_text,
    })
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    // T-13.1-04: Only allow http:// and https:// URLs to prevent arbitrary command execution
    let trimmed = url.trim();
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("Blocked: only http:// and https:// URLs are allowed".to_string());
    }

    open::that(trimmed).map_err(|e| format!("Failed to open URL in system browser: {}", e))
}

#[tauri::command]
pub fn open_local_path(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    // Clean file:// URI prefix if present
    let mut clean_path = trimmed;
    if clean_path.to_lowercase().starts_with("file://") {
        clean_path = &clean_path[7..];
        // On Windows, file:///C:/path might leave /C:/path
        #[cfg(target_os = "windows")]
        if clean_path.starts_with('/') && clean_path.len() > 3 && clean_path.chars().nth(2) == Some(':') {
            clean_path = &clean_path[1..];
        }
    }

    let p = std::path::Path::new(clean_path);
    if !p.exists() {
        return Err(format!("Đường dẫn không tồn tại: {}", clean_path));
    }

    open::that(clean_path).map_err(|e| format!("Không thể mở đường dẫn hệ thống: {}", e))
}

#[tauri::command]
pub fn select_local_folder() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .set_title("Chọn thư mục liên kết")
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn select_local_file() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .set_title("Chọn tập tin liên kết")
        .pick_file()
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn read_local_file_text_head(file_path: String, max_lines: usize) -> Result<String, String> {
    let trimmed = file_path.trim();
    if trimmed.is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    let mut clean_path = trimmed;
    if clean_path.to_lowercase().starts_with("file://") {
        clean_path = &clean_path[7..];
        #[cfg(target_os = "windows")]
        if clean_path.starts_with('/') && clean_path.len() > 3 && clean_path.chars().nth(2) == Some(':') {
            clean_path = &clean_path[1..];
        }
    }

    let path = std::path::Path::new(clean_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", clean_path));
    }
    if !path.is_file() {
        return Err(format!("Path is not a regular file: {}", clean_path));
    }

    // Security mitigation T-13.2-05: Block sensitive paths
    let path_str = clean_path.replace('\\', "/");
    let lower_path = path_str.to_lowercase();
    if lower_path.contains("/.ssh/") || lower_path.contains("/.gnupg/") || lower_path.contains("/.env") {
        return Err("Access to sensitive system or credential files is blocked".to_string());
    }

    use std::io::{BufRead, BufReader};
    let file = std::fs::File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let reader = BufReader::new(file);

    let limit = if max_lines == 0 { 2000 } else { max_lines.min(2000) };
    let mut lines = Vec::new();

    for line_result in reader.lines().take(limit) {
        let line = line_result.map_err(|e| format!("Failed to read file as text: {}", e))?;
        lines.push(line);
    }

    Ok(lines.join("\n"))
}

#[tauri::command]
pub fn launch_claude_terminal(command_str: String) -> Result<(), String> {
    let trimmed = command_str.trim();
    if trimmed.is_empty() {
        return Err("Command cannot be empty".to_string());
    }

    // Security check: command must start with "claude" or be a cd command launching claude
    let is_valid = trimmed.starts_with("claude ")
        || trimmed == "claude"
        || (trimmed.starts_with("cd ") && (trimmed.ends_with("&& claude") || trimmed.contains("&& claude")));
    if !is_valid {
        return Err("Only claude commands can be launched".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        // Use AppleScript to tell Terminal.app to activate and do script
        // Escape quotes and backslashes for AppleScript string literal
        let escaped = trimmed
            .replace('\\', "\\\\")
            .replace('"', "\\\"");

        let script = format!(
            "tell application \"Terminal\"\nactivate\ndo script \"{}\"\nend tell",
            escaped
        );

        std::process::Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .spawn()
            .map_err(|e| format!("Failed to spawn Terminal on macOS: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows launch cmd /k in a new window
        std::process::Command::new("cmd")
            .arg("/c")
            .arg("start")
            .arg("cmd")
            .arg("/k")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("Failed to spawn cmd.exe on Windows: {}", e))?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        // Linux fallback using x-terminal-emulator or sh
        std::process::Command::new("x-terminal-emulator")
            .arg("-e")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("Failed to spawn terminal on Linux: {}", e))?;
    }

    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PathSuggestion {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileSliceResult {
    pub file_path: String,
    pub lines_read: usize,
    pub total_lines_est: usize,
    pub offset: usize,
    pub truncated: bool,
    pub content: String,
    pub is_binary: bool,
}

fn expand_tilde_path(path_str: &str) -> String {
    if path_str == "~" || path_str.starts_with("~/") || path_str.starts_with("~\\") {
        if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
            if path_str == "~" {
                return home;
            }
            return format!("{}{}", home, &path_str[1..]);
        }
    }
    path_str.to_string()
}

#[tauri::command]
pub fn complete_local_path(input: String) -> Result<Vec<PathSuggestion>, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let expanded = expand_tilde_path(trimmed);
    let path = std::path::Path::new(&expanded);

    let (parent_dir, prefix) = if expanded.ends_with('/') || expanded.ends_with('\\') {
        (path.to_path_buf(), String::new())
    } else {
        let parent = path.parent().unwrap_or_else(|| std::path::Path::new("."));
        let prefix = path.file_name().and_then(|f| f.to_str()).unwrap_or("").to_string();
        (parent.to_path_buf(), prefix)
    };

    if !parent_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut suggestions = Vec::new();
    let lower_prefix = prefix.to_lowercase();

    if let Ok(entries) = std::fs::read_dir(&parent_dir) {
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            // Skip hidden files unless user explicitly typed dot prefix
            if file_name.starts_with('.') && !prefix.starts_with('.') {
                continue;
            }

            if lower_prefix.is_empty() || file_name.to_lowercase().starts_with(&lower_prefix) {
                let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
                let full_path = entry.path().to_string_lossy().to_string();
                suggestions.push(PathSuggestion {
                    path: if is_dir { format!("{}/", full_path.trim_end_matches('/')) } else { full_path },
                    name: file_name,
                    is_dir,
                });
            }
        }
    }

    // Sort: directories first, then alphabetical
    suggestions.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    suggestions.truncate(30);
    Ok(suggestions)
}

#[tauri::command]
pub fn read_local_file_slice(
    file_path: String,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<FileSliceResult, String> {
    let trimmed = file_path.trim();
    if trimmed.is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    let mut clean_path = trimmed;
    if clean_path.to_lowercase().starts_with("file://") {
        clean_path = &clean_path[7..];
        #[cfg(target_os = "windows")]
        if clean_path.starts_with('/') && clean_path.len() > 3 && clean_path.chars().nth(2) == Some(':') {
            clean_path = &clean_path[1..];
        }
    }

    let expanded = expand_tilde_path(clean_path);
    let path = std::path::Path::new(&expanded);

    if !path.exists() {
        return Err(format!("File does not exist: {}", expanded));
    }
    if !path.is_file() {
        return Err(format!("Path is not a regular file: {}", expanded));
    }

    // Security check: Block sensitive credential paths
    let path_str = expanded.replace('\\', "/");
    let lower_path = path_str.to_lowercase();
    if lower_path.contains("/.ssh/") || lower_path.contains("/.gnupg/") || lower_path.contains("/.env") {
        return Err("Access to sensitive system or credential files is blocked".to_string());
    }

    let metadata = std::fs::metadata(path).map_err(|e| format!("Failed to read metadata: {}", e))?;
    let file_len = metadata.len();
    if file_len > 20 * 1024 * 1024 {
        return Err(format!("File too large (>20MB): {}", expanded));
    }

    use std::io::{BufRead, BufReader, Read};
    let mut file = std::fs::File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;

    // Check if binary by reading first 1024 bytes
    let mut probe_buf = [0u8; 1024];
    let bytes_read = file.read(&mut probe_buf).unwrap_or(0);
    let is_binary = probe_buf[..bytes_read].contains(&0u8);

    if is_binary {
        return Ok(FileSliceResult {
            file_path: expanded,
            lines_read: 0,
            total_lines_est: 0,
            offset: 1,
            truncated: false,
            content: "[Binary file - cannot display content as text]".to_string(),
            is_binary: true,
        });
    }

    // Reopen for line streaming
    drop(file);
    let file = std::fs::File::open(path).map_err(|e| format!("Failed to reopen file: {}", e))?;
    let reader = BufReader::new(file);

    let start_offset = offset.unwrap_or(1).max(1);
    let max_lines = limit.unwrap_or(500).min(2000);

    let mut lines_output = Vec::new();
    let mut current_line_num = 0usize;
    let mut lines_read_count = 0usize;
    let mut truncated = false;

    for line_res in reader.lines() {
        current_line_num += 1;
        let line = match line_res {
            Ok(l) => l,
            Err(_) => {
                truncated = true;
                break;
            }
        };

        if current_line_num < start_offset {
            continue;
        }

        if lines_read_count >= max_lines {
            truncated = true;
            break;
        }

        lines_output.push(format!("{:6}\t{}", current_line_num, line));
        lines_read_count += 1;
    }

    Ok(FileSliceResult {
        file_path: expanded,
        lines_read: lines_read_count,
        total_lines_est: current_line_num,
        offset: start_offset,
        truncated,
        content: lines_output.join("\n"),
        is_binary: false,
    })
}



