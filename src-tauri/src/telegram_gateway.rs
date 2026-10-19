use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramStatusResponse {
    pub running: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramInboundPayload {
    pub update_id: i64,
    pub message_id: i64,
    pub chat_id: String,
    pub from_name: String,
    pub text: String,
    pub date: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramConflictPayload {
    pub reason: String,
    pub timestamp: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct TelegramUser {
    pub id: i64,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub username: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct TelegramChat {
    pub id: i64,
    pub title: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub username: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct TelegramMessage {
    pub message_id: i64,
    pub from: Option<TelegramUser>,
    pub chat: TelegramChat,
    pub date: i64,
    pub text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TelegramUpdate {
    pub update_id: i64,
    pub message: Option<TelegramMessage>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct TelegramApiResponse<T> {
    pub ok: bool,
    pub result: Option<T>,
    pub description: Option<String>,
}

pub struct TelegramGatewayState {
    cancel_token: Arc<Mutex<Option<CancellationToken>>>,
    is_running: Arc<AtomicBool>,
    last_error: Arc<Mutex<Option<String>>>,
    http_client: Client,
}

impl TelegramGatewayState {
    pub fn new() -> Self {
        let http_client = Client::builder()
            .timeout(Duration::from_secs(35))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            cancel_token: Arc::new(Mutex::new(None)),
            is_running: Arc::new(AtomicBool::new(false)),
            last_error: Arc::new(Mutex::new(None)),
            http_client,
        }
    }
}

#[tauri::command]
pub async fn start_telegram_polling(
    app: AppHandle,
    state: State<'_, TelegramGatewayState>,
    token: String,
) -> Result<(), String> {
    let clean_token = token.trim().to_string();
    if clean_token.is_empty() {
        return Err("Telegram bot token cannot be empty".to_string());
    }

    // Cancel any existing task
    {
        let mut token_lock = state.cancel_token.lock().await;
        if let Some(token) = token_lock.take() {
            token.cancel();
        }
    }

    let cancel_token = CancellationToken::new();
    {
        let mut token_lock = state.cancel_token.lock().await;
        *token_lock = Some(cancel_token.clone());
    }

    state.is_running.store(true, Ordering::SeqCst);
    {
        let mut err_lock = state.last_error.lock().await;
        *err_lock = None;
    }

    let _ = app.emit("telegram-status-changed", TelegramStatusResponse {
        running: true,
        error: None,
    });

    let is_running_clone = state.is_running.clone();
    let last_error_clone = state.last_error.clone();
    let client = state.http_client.clone();
    let app_handle = app.clone();

    tokio::spawn(async move {
        let mut offset: i64 = 0;
        let bot_token = clean_token;

        while !cancel_token.is_cancelled() {
            let url = format!(
                "https://api.telegram.org/bot{}/getUpdates?offset={}&timeout=25",
                bot_token, offset
            );

            let res_opt = tokio::select! {
                _ = cancel_token.cancelled() => {
                    break;
                }
                res = client.get(&url).send() => {
                    res
                }
            };

            match res_opt {
                Ok(response) => {
                    let status = response.status();
                    if status.as_u16() == 409 {
                        let err_msg = "Telegram 409 Conflict: Another instance is polling getUpdates with this bot token".to_string();
                        {
                            let mut err_lock = last_error_clone.lock().await;
                            *err_lock = Some(err_msg.clone());
                        }
                        is_running_clone.store(false, Ordering::SeqCst);
                        cancel_token.cancel();

                        let now_iso = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs().to_string())
                            .unwrap_or_else(|_| "0".to_string());

                        let _ = app_handle.emit(
                            "telegram-conflict-detected",
                            TelegramConflictPayload {
                                reason: err_msg.clone(),
                                timestamp: now_iso,
                            },
                        );

                        let _ = app_handle.emit(
                            "telegram-status-changed",
                            TelegramStatusResponse {
                                running: false,
                                error: Some(err_msg),
                            },
                        );
                        break;
                    }

                    if status.is_success() {
                        if let Ok(api_res) = response.json::<TelegramApiResponse<Vec<TelegramUpdate>>>().await {
                            if api_res.ok {
                                if let Some(updates) = api_res.result {
                                    for update in updates {
                                        if update.update_id >= offset {
                                            offset = update.update_id + 1;
                                        }

                                        if let Some(msg) = update.message {
                                            if let Some(text) = msg.text {
                                                let from_name = if let Some(from) = msg.from {
                                                    from.first_name.unwrap_or_else(|| {
                                                        from.username.unwrap_or_else(|| "User".to_string())
                                                    })
                                                } else {
                                                    "User".to_string()
                                                };

                                                let payload = TelegramInboundPayload {
                                                    update_id: update.update_id,
                                                    message_id: msg.message_id,
                                                    chat_id: msg.chat.id.to_string(),
                                                    from_name,
                                                    text,
                                                    date: msg.date,
                                                };

                                                let _ = app_handle.emit("telegram-inbound", payload);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        // Non-conflict HTTP error, wait 3 seconds before retry
                        tokio::select! {
                            _ = cancel_token.cancelled() => break,
                            _ = tokio::time::sleep(Duration::from_secs(3)) => {}
                        }
                    }
                }
                Err(err) => {
                    if !cancel_token.is_cancelled() {
                        let _ = err; // Back off on network glitch
                        tokio::select! {
                            _ = cancel_token.cancelled() => break,
                            _ = tokio::time::sleep(Duration::from_secs(3)) => {}
                        }
                    }
                }
            }
        }

        is_running_clone.store(false, Ordering::SeqCst);
        let _ = app_handle.emit(
            "telegram-status-changed",
            TelegramStatusResponse {
                running: false,
                error: last_error_clone.lock().await.clone(),
            },
        );
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_telegram_polling(
    app: AppHandle,
    state: State<'_, TelegramGatewayState>,
) -> Result<(), String> {
    {
        let mut token_lock = state.cancel_token.lock().await;
        if let Some(token) = token_lock.take() {
            token.cancel();
        }
    }

    state.is_running.store(false, Ordering::SeqCst);

    let _ = app.emit("telegram-status-changed", TelegramStatusResponse {
        running: false,
        error: None,
    });

    Ok(())
}

#[tauri::command]
pub async fn get_telegram_status(
    state: State<'_, TelegramGatewayState>,
) -> Result<TelegramStatusResponse, String> {
    let running = state.is_running.load(Ordering::SeqCst);
    let error = state.last_error.lock().await.clone();

    Ok(TelegramStatusResponse { running, error })
}

#[derive(Serialize)]
struct SendMessageBody {
    chat_id: String,
    text: String,
    parse_mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reply_to_message_id: Option<i64>,
}

#[tauri::command]
pub async fn send_telegram_reply(
    token: String,
    chat_id: String,
    text: String,
    reply_to_message_id: Option<i64>,
) -> Result<(), String> {
    let clean_token = token.trim();
    if clean_token.is_empty() {
        return Err("Telegram token cannot be empty".to_string());
    }

    let url = format!("https://api.telegram.org/bot{}/sendMessage", clean_token);
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    // Try HTML parse_mode first (convert standard markdown to safe HTML),
    // or try Markdown first then fallback to plain text if Telegram Markdown parsing fails.
    let body_markdown = SendMessageBody {
        chat_id: chat_id.clone(),
        text: text.clone(),
        parse_mode: "Markdown".to_string(),
        reply_to_message_id,
    };

    let res = client
        .post(&url)
        .json(&body_markdown)
        .send()
        .await
        .map_err(|e| format!("Network error sending reply: {}", e))?;

    if !res.status().is_success() {
        // Fallback: If Markdown parsing failed (e.g. unclosed tags/asterisks), send as plain text without parse_mode
        let body_plain = serde_json::json!({
            "chat_id": chat_id,
            "text": text,
            "reply_to_message_id": reply_to_message_id,
        });

        let fallback_res = client
            .post(&url)
            .json(&body_plain)
            .send()
            .await
            .map_err(|e| format!("Network error sending fallback reply: {}", e))?;

        if !fallback_res.status().is_success() {
            let err_text = fallback_res.text().await.unwrap_or_default();
            return Err(format!("Telegram Bot API error: {}", err_text));
        }
    }

    Ok(())
}

#[derive(Serialize)]
struct SendChatActionBody {
    chat_id: String,
    action: String,
}

#[tauri::command]
pub async fn send_telegram_action(
    token: String,
    chat_id: String,
    action: String,
) -> Result<(), String> {
    let clean_token = token.trim();
    if clean_token.is_empty() {
        return Err("Telegram token cannot be empty".to_string());
    }

    let url = format!("https://api.telegram.org/bot{}/sendChatAction", clean_token);
    let body = SendChatActionBody { chat_id, action };

    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error sending chat action: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Telegram Bot API error: {}", err_text));
    }

    Ok(())
}
