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
