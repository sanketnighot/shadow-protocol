use serde::{Deserialize, Serialize};
use crate::services::settings;

#[derive(Debug, Deserialize)]
pub struct SetKeyInput {
    pub key: String,
}

#[derive(Debug, Serialize)]
pub struct SettingsResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct GetKeyResult {
    pub key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[tauri::command]
pub async fn set_perplexity_key(input: SetKeyInput) -> SettingsResult {
    match settings::set_perplexity_key(&input.key) {
        Ok(_) => SettingsResult { success: true, error: None },
        Err(e) => SettingsResult { success: false, error: Some(e.to_string()) },
    }
}

#[tauri::command]
pub async fn get_perplexity_key() -> GetKeyResult {
    match settings::get_perplexity_key() {
        Ok(key) => GetKeyResult { key, error: None },
        Err(e) => GetKeyResult { key: None, error: Some(e.to_string()) },
    }
}

#[tauri::command]
pub async fn remove_perplexity_key() -> SettingsResult {
    match settings::remove_perplexity_key() {
        Ok(_) => SettingsResult { success: true, error: None },
        Err(e) => SettingsResult { success: false, error: Some(e.to_string()) },
    }
}

#[tauri::command]
pub async fn set_alchemy_key(input: SetKeyInput) -> SettingsResult {
    match settings::set_alchemy_key(&input.key) {
        Ok(_) => SettingsResult { success: true, error: None },
        Err(e) => SettingsResult { success: false, error: Some(e.to_string()) },
    }
}

#[tauri::command]
pub async fn get_alchemy_key() -> GetKeyResult {
    match settings::get_alchemy_key() {
        Ok(key) => GetKeyResult { key, error: None },
        Err(e) => GetKeyResult { key: None, error: Some(e.to_string()) },
    }
}

#[tauri::command]
pub async fn remove_alchemy_key() -> SettingsResult {
    match settings::remove_alchemy_key() {
        Ok(_) => SettingsResult { success: true, error: None },
        Err(e) => SettingsResult { success: false, error: Some(e.to_string()) },
    }
}

#[tauri::command]
pub async fn set_ollama_key(input: SetKeyInput) -> SettingsResult {
    match settings::set_ollama_key(&input.key) {
        Ok(_) => SettingsResult { success: true, error: None },
        Err(e) => SettingsResult { success: false, error: Some(e.to_string()) },
    }
}

#[tauri::command]
pub async fn get_ollama_key() -> GetKeyResult {
    match settings::get_ollama_key() {
        Ok(key) => GetKeyResult { key, error: None },
        Err(e) => GetKeyResult { key: None, error: Some(e.to_string()) },
    }
}

#[tauri::command]
pub async fn remove_ollama_key() -> SettingsResult {
    match settings::remove_ollama_key() {
        Ok(_) => SettingsResult { success: true, error: None },
        Err(e) => SettingsResult { success: false, error: Some(e.to_string()) },
    }
}
