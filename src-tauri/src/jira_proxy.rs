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

