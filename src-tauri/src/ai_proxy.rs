use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

const GRAPHITI_MCP_URL: &str = "http://10.4.97.70:30456/mcp";
const GRAPHITI_MAX_REQUEST_BYTES: usize = 256 * 1024;
const GRAPHITI_MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const GRAPHITI_ALLOWED_TOOLS: [&str; 4] = [
    "list_advertised_groups",
    "search_nodes",
    "search_memory_facts",
    "get_catalog_object_context",
];

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

fn validate_graphiti_request(body: &str) -> Result<(), String> {
    if body.len() > GRAPHITI_MAX_REQUEST_BYTES {
        return Err("Graphiti MCP request body is too large".to_string());
    }

    let payload: Value =
        serde_json::from_str(body).map_err(|_| "Invalid Graphiti MCP JSON-RPC payload".to_string())?;
    let object = payload
        .as_object()
        .ok_or_else(|| "Graphiti MCP payload must be one JSON-RPC object".to_string())?;

    if object.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        return Err("Graphiti MCP payload must use JSON-RPC 2.0".to_string());
    }

    match object.get("method").and_then(Value::as_str) {
        Some("initialize" | "notifications/initialized" | "tools/list") => Ok(()),
        Some("tools/call") => {
            let name = object
                .get("params")
                .and_then(Value::as_object)
                .and_then(|params| params.get("name"))
                .and_then(Value::as_str)
                .ok_or_else(|| "Graphiti tools/call requires params.name".to_string())?;

            if GRAPHITI_ALLOWED_TOOLS.contains(&name) {
                Ok(())
            } else {
                Err(format!("Blocked Graphiti MCP tool: {}", name))
            }
        }
        Some(method) => Err(format!("Blocked Graphiti MCP method: {}", method)),
        None => Err("Graphiti MCP payload requires method".to_string()),
    }
}

fn graphiti_session_id_is_valid(session_id: &str) -> bool {
    !session_id.is_empty()
        && session_id.len() <= 256
        && session_id.bytes().all(|byte| byte.is_ascii_graphic())
}

#[tauri::command]
pub async fn graphiti_mcp_request(
    body: String,
    session_id: Option<String>,
) -> Result<AiProxyResponse, String> {
    validate_graphiti_request(&body)?;
    if session_id
        .as_deref()
        .is_some_and(|value| !graphiti_session_id_is_valid(value))
    {
        return Err("Invalid Graphiti MCP session ID".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("PlannerMateGraphitiMCP/1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let mut request = client
        .post(GRAPHITI_MCP_URL)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(reqwest::header::ACCEPT, "application/json, text/event-stream")
        .body(body);
    if let Some(value) = session_id {
        request = request.header("Mcp-Session-Id", value);
    }

    let mut response = request
        .send()
        .await
        .map_err(|e| format!("Graphiti MCP request failed: {}", e))?;
    if response
        .content_length()
        .is_some_and(|length| length > GRAPHITI_MAX_RESPONSE_BYTES as u64)
    {
        return Err("Graphiti MCP response body is too large".to_string());
    }

    let status = response.status().as_u16();
    let mut headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(value) = value.to_str() {
            headers.insert(key.as_str().to_string(), value.to_string());
        }
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Failed to read Graphiti MCP response body: {}", e))?
    {
        if bytes.len() + chunk.len() > GRAPHITI_MAX_RESPONSE_BYTES {
            return Err("Graphiti MCP response body is too large".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = String::from_utf8(bytes)
        .map_err(|_| "Graphiti MCP response body is not valid UTF-8".to_string())?;

    Ok(AiProxyResponse {
        status,
        headers,
        body,
    })
}

#[cfg(test)]
mod tests {
    use super::{is_allowed_ai_target, validate_graphiti_request, GRAPHITI_MAX_REQUEST_BYTES};

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

    #[test]
    fn graphiti_allows_handshake_and_discovery_methods() {
        for method in ["initialize", "notifications/initialized", "tools/list"] {
            let body = format!(r#"{{"jsonrpc":"2.0","id":1,"method":"{}"}}"#, method);
            assert!(validate_graphiti_request(&body).is_ok(), "{}", method);
        }
    }

    #[test]
    fn graphiti_allows_only_read_tools() {
        for name in [
            "list_advertised_groups",
            "search_nodes",
            "search_memory_facts",
            "get_catalog_object_context",
        ] {
            let body = format!(
                r#"{{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{{"name":"{}","arguments":{{}}}}}}"#,
                name
            );
            assert!(validate_graphiti_request(&body).is_ok(), "{}", name);
        }
    }

    #[test]
    fn graphiti_rejects_mutations_and_unknown_tools() {
        for name in [
            "create_episode",
            "update_node",
            "delete_memory",
            "search_everything",
        ] {
            let body = format!(
                r#"{{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{{"name":"{}"}}}}"#,
                name
            );
            assert!(validate_graphiti_request(&body).is_err(), "{}", name);
        }
    }

    #[test]
    fn graphiti_rejects_unknown_malformed_batch_and_oversized_payloads() {
        assert!(validate_graphiti_request(
            r#"{"jsonrpc":"2.0","id":1,"method":"resources/list"}"#
        )
        .is_err());
        assert!(validate_graphiti_request("not json").is_err());
        assert!(validate_graphiti_request(
            r#"[{"jsonrpc":"2.0","id":1,"method":"tools/list"}]"#
        )
        .is_err());
        let oversized = " ".repeat(GRAPHITI_MAX_REQUEST_BYTES + 1);
        assert!(validate_graphiti_request(&oversized).is_err());
    }
}
