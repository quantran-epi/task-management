use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProxyResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
}

pub fn is_allowed_ai_target(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };

    if !parsed.path().starts_with("/v1/") {
        return false;
    }

    match parsed.scheme() {
        "https" => true,
        "http" => parsed
            .host_str()
            .map(|host| matches!(host, "localhost" | "127.0.0.1" | "::1"))
            .unwrap_or(false),
        _ => false,
    }
}

fn is_forwardable_header(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    !matches!(
        lower.as_str(),
        "host"
            | "origin"
            | "referer"
            | "connection"
            | "transfer-encoding"
            | "content-length"
            | "accept-encoding"
            | "cookie"
            | "priority"
            | "user-agent"
    ) && !lower.starts_with("sec-")
}

#[tauri::command]
pub async fn ai_proxy_request(
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<AiProxyResponse, String> {
    if !is_allowed_ai_target(&url) {
        return Err("Blocked AI proxy target".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("PlannerMateAIProxy/1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let req_method = match method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        other => return Err(format!("Unsupported HTTP method: {}", other)),
    };

    let mut req_builder = client.request(req_method, &url);

    for (key, value) in headers {
        if is_forwardable_header(&key) {
            req_builder = req_builder.header(&key, &value);
        }
    }

    if let Some(request_body) = body {
        req_builder = req_builder.body(request_body);
    }

    let response = req_builder
        .send()
        .await
        .map_err(|e| format!("AI proxy request failed: {}", e))?;

    let status = response.status().as_u16();
    let mut response_headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(value_str) = value.to_str() {
            response_headers.insert(key.as_str().to_string(), value_str.to_string());
        }
    }

    let body_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    Ok(AiProxyResponse {
        status,
        headers: response_headers,
        body: body_text,
    })
}

#[cfg(test)]
mod tests {
    use super::is_allowed_ai_target;

    #[test]
    fn allows_https_v1_targets() {
        assert!(is_allowed_ai_target("https://example.test/v1/models"));
    }

    #[test]
    fn allows_loopback_http_v1_targets() {
        assert!(is_allowed_ai_target("http://localhost:20128/v1/models"));
        assert!(is_allowed_ai_target("http://127.0.0.1:20128/v1/models"));
        assert!(is_allowed_ai_target("http://[::1]:20128/v1/models"));
    }

    #[test]
    fn rejects_unsafe_targets() {
        assert!(!is_allowed_ai_target("http://192.168.1.5:20128/v1/models"));
        assert!(!is_allowed_ai_target("file:///tmp/key"));
        assert!(!is_allowed_ai_target("not a url"));
        assert!(!is_allowed_ai_target("https://example.test/models"));
        assert!(!is_allowed_ai_target("https://example.test/v2/models"));
    }
}
