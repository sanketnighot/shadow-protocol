//! Shared non-secret payload builders for app adapters.

use serde_json::Value;
use tauri::AppHandle;

use crate::services::agent_state::{read_memory, read_soul};

pub fn backup_payload_from_scope(app: &AppHandle, scope: &Value) -> Result<Vec<u8>, String> {
    let mut obj = serde_json::json!({
        "v": 1,
        "scope": scope,
        "encryptionNote": "Payload is sealed locally; upgrade path: AES-GCM with keychain DEK before mainnet.",
    });
    if scope
        .get("agentMemory")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        let memory = read_memory(app).unwrap_or_default();
        obj["memoryFacts"] =
            serde_json::to_value(memory.facts).unwrap_or_else(|_| serde_json::json!([]));
    }
    if scope
        .get("persona")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        let soul = read_soul(app).unwrap_or_default();
        obj["soul"] = serde_json::to_value(soul).map_err(|e| e.to_string())?;
    }
    serde_json::to_vec(&obj).map_err(|e| e.to_string())
}
