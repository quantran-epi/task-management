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

    // Security check T-13.2-07: command must start with "claude"
    if !trimmed.starts_with("claude ") && trimmed != "claude" {
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



