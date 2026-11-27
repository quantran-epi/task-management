//! Local bridge between TaskMate and standalone chat: tiny per-identity JSON records on disk.
//! This is local client-side control only, not a signature or cryptographic grant; a user with
//! filesystem/DB access can tamper with it. No token content is logged.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const IDENTITY_MIN_DIGITS: usize = 6;
const IDENTITY_MAX_DIGITS: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StandaloneAccessRecord {
    pub telegram_user_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub policy_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub issued_at: Option<String>,
    pub updated_at: String,
}

fn sanitize_identity(telegram_user_id: &str) -> Result<String, String> {
    let id = telegram_user_id.trim();
    if id.len() < IDENTITY_MIN_DIGITS
        || id.len() > IDENTITY_MAX_DIGITS
        || !id.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err("Telegram User ID không hợp lệ (cần 6-12 chữ số).".to_string());
    }
    Ok(id.to_string())
}

fn access_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .ok_or_else(|| "Không tìm thấy thư mục người dùng.".to_string())?;
    Ok(Path::new(&home).join(".taskmate").join("standalone-access"))
}

fn record_path(telegram_user_id: &str) -> Result<PathBuf, String> {
    Ok(access_dir()?.join(format!("{}.json", sanitize_identity(telegram_user_id)?)))
}

fn now_iso() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{}Z", secs)
}

fn write_record_atomic(record: &StandaloneAccessRecord) -> Result<(), String> {
    let target = record_path(&record.telegram_user_id)?;
    fs::create_dir_all(target.parent().ok_or_else(|| "Đường dẫn bridge không hợp lệ.".to_string())?)
        .map_err(|err| format!("Không tạo được thư mục bridge: {err}"))?;

    let temp = target.with_extension(format!("tmp-{}", std::process::id()));
    let json = serde_json::to_vec(record).map_err(|err| format!("Không mã hoá record: {err}"))?;
    fs::write(&temp, json).map_err(|err| format!("Không ghi bridge tạm: {err}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&temp, fs::Permissions::from_mode(0o600));
    }

    match fs::rename(&temp, &target) {
        Ok(()) => Ok(()),
        Err(err) => {
            let _ = fs::remove_file(&temp);
            Err(format!("Không cập nhật bridge: {err}"))
        }
    }
}

fn read_all() -> Vec<StandaloneAccessRecord> {
    let Ok(dir) = access_dir() else { return Vec::new() };
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    let mut records = Vec::new();
    for entry in entries.flatten() {
        let Ok(bytes) = fs::read(entry.path()) else { continue };
        match serde_json::from_slice::<StandaloneAccessRecord>(&bytes) {
            Ok(record) if sanitize_identity(&record.telegram_user_id).is_ok() => records.push(record),
            // A corrupt file is ignored rather than panicking the whole list.
            _ => continue,
        }
    }
    records
}

#[tauri::command]
pub fn standalone_access_request(telegram_user_id: String, requested_at: String) -> Result<(), String> {
    let id = sanitize_identity(&telegram_user_id)?;
    write_record_atomic(&StandaloneAccessRecord {
        telegram_user_id: id,
        status: "pending".to_string(),
        requested_at: Some(requested_at),
        policy_token: None,
        issued_at: None,
        updated_at: now_iso(),
    })
}

#[tauri::command]
pub fn standalone_access_apply(
    telegram_user_id: String,
    status: String,
    policy_token: Option<String>,
) -> Result<(), String> {
    let approved = status == "approved";
    if approved && policy_token.as_ref().map(|t| t.trim().is_empty()).unwrap_or(true) {
        return Err("Thiếu policy token khi cấp quyền.".to_string());
    }
    write_record_atomic(&StandaloneAccessRecord {
        telegram_user_id: sanitize_identity(&telegram_user_id)?,
        status,
        requested_at: None,
        policy_token: if approved { policy_token } else { None },
        issued_at: if approved { Some(now_iso()) } else { None },
        updated_at: now_iso(),
    })
}

#[tauri::command]
pub fn standalone_access_list() -> Vec<StandaloneAccessRecord> {
    read_all()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_rejects_path_traversal_and_short_ids() {
        assert!(sanitize_identity(IDENTITY_ID).is_ok());
        assert!(sanitize_identity("../etc/passwd").is_err());
        assert!(sanitize_identity("12345").is_err());
        assert!(sanitize_identity("12a456789").is_err());
    }

    const IDENTITY_ID: &str = "123456789";

    #[test]
    fn record_roundtrip_drops_token_for_denied_status() {
        let dir = std::env::temp_dir().join(format!("taskmate-bridge-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join(format!("{IDENTITY_ID}.json"));

        let record = StandaloneAccessRecord {
            telegram_user_id: IDENTITY_ID.to_string(),
            status: "approved".to_string(),
            requested_at: None,
            policy_token: Some("TMMATE_POLICY_V1:token".to_string()),
            issued_at: Some("2026-11-27T00:00:00Z".to_string()),
            updated_at: "2026-11-27T00:00:00Z".to_string(),
        };
        fs::write(&target, serde_json::to_vec(&record).unwrap()).unwrap();
        let parsed: StandaloneAccessRecord =
            serde_json::from_slice(&fs::read(&target).unwrap()).unwrap();
        assert_eq!(parsed.policy_token.as_deref(), Some("TMMATE_POLICY_V1:token"));

        let denied = StandaloneAccessRecord {
            status: "denied".to_string(),
            policy_token: None,
            issued_at: None,
            ..record
        };
        let json = serde_json::to_string(&denied).unwrap();
        assert!(!json.contains("policyToken"));
        assert!(!json.contains("issuedAt"));
        fs::write(&target, b"not json").unwrap();
        assert!(serde_json::from_slice::<StandaloneAccessRecord>(&fs::read(&target).unwrap()).is_err());

        let _ = fs::remove_dir_all(&dir);
    }
}
