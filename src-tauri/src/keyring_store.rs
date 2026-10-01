#[tauri::command]
pub fn store_credential(service: &str, key: &str, secret: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(service, key).map_err(|e| e.to_string())?;
    entry.set_password(secret).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_credential(service: &str, key: &str) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(service, key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(pwd) => Ok(Some(pwd)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn delete_credential(service: &str, key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(service, key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
