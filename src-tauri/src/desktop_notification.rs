//! Clickable native desktop notifications.
//!
//! `@tauri-apps/plugin-notification` shows desktop banners through `notify_rust::Notification::show()`
//! and discards the returned handle, so it can never observe a user click. Its JS click APIs
//! (`onNotificationReceived` / `onAction`) are explicitly mobile-only. This module fills that gap:
//! it shows a native notification with `notify_rust` directly, waits for the user's default (body)
//! click on a background thread, focuses the main window, and emits a `notification-clicked` event
//! carrying the target hash route. The frontend turns that route into an in-app navigation.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use notify_rust::{Notification, NotificationResponse};
use tauri::{AppHandle, Emitter, Manager};

/// Payload delivered with the `notification-clicked` Tauri event.
#[derive(Clone, serde::Serialize)]
pub struct NotificationClickedPayload {
    /// Hash route to navigate to, e.g. `#/planner?date=2026-11-17`.
    pub route: String,
}

/// Shows a native notification whose body click focuses the main window and emits a navigation
/// event. `deeplink` is a hash route (e.g. `#/tasks`) chosen by the frontend, which owns the
/// mapping from notification context to target page.
#[tauri::command]
pub fn send_clickable_notification(
    app: AppHandle,
    title: String,
    body: Option<String>,
    deeplink: Option<String>,
) -> Result<(), String> {
    let mut notification = Notification::new();
    notification.summary(&title);
    if let Some(body) = body.as_deref() {
        notification.body(body);
    }
    // Register the "default" action so an XDG body click is delivered as the default action key;
    // on Windows/macOS a body click maps to NotificationResponse::Default. A named button also
    // gives users an explicit click target on platforms that surface action buttons.
    notification.action("default", "Mở");

    let handle = notification.show().map_err(|error| error.to_string())?;

    let route = deeplink.unwrap_or_else(|| "#/dashboard".to_string());
    let clicked = Arc::new(AtomicBool::new(false));
    let clicked_in_handler = clicked.clone();

    // Wait for the click off the main thread. `wait_for_response` blocks (zbus `block_on` on
    // Linux, channel `recv` on Windows) and must not stall the Tauri event loop. It returns on
    // dismiss/expiry too, so a thread cannot linger forever.
    std::thread::spawn(move || {
        let _ = handle.wait_for_response(|response: &NotificationResponse| {
            if matches!(
                response,
                NotificationResponse::Default | NotificationResponse::Action(_)
            ) {
                clicked_in_handler.store(true, Ordering::SeqCst);
            }
        });

        if !clicked.load(Ordering::SeqCst) {
            return;
        }

        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
        let _ = app.emit("notification-clicked", NotificationClickedPayload { route });
    });

    Ok(())
}
