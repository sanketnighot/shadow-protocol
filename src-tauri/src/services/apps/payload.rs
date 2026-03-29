//! Shared non-secret payload builders for app adapters.

use serde_json::{Map, Value};
use tauri::AppHandle;

use crate::services::agent_state::{read_memory, read_soul};
use crate::services::apps::state::list_all_app_configs;
use crate::services::local_db::{self, ActiveStrategy};

/// Snapshot format version written to Filecoin backup payloads.
pub const SNAPSHOT_VERSION: u64 = 2;

/// Build a JSON snapshot for upload from scope flags (merged from user config + job defaults).
pub fn backup_payload_from_scope(app: &AppHandle, scope: &Value) -> Result<Vec<u8>, String> {
    let mut obj = Map::new();
    obj.insert("v".to_string(), Value::Number(SNAPSHOT_VERSION.into()));
    obj.insert("scope".to_string(), scope.clone());
    obj.insert(
        "encryptionNote".to_string(),
        Value::String(
            "Payload is sealed locally; upgrade path: AES-GCM with keychain DEK before mainnet."
                .to_string(),
        ),
    );

    let agent_memory = scope
        .get("agentMemory")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if agent_memory {
        let memory = read_memory(app).unwrap_or_default();
        obj.insert(
            "memoryFacts".to_string(),
            serde_json::to_value(memory.facts).unwrap_or_else(|_| Value::Array(vec![])),
        );
        let soul = read_soul(app).unwrap_or_default();
        obj.insert(
            "soul".to_string(),
            serde_json::to_value(soul).map_err(|e| e.to_string())?,
        );
    } else if scope
        .get("persona")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        // Legacy scope key: soul only when agentMemory was off.
        let soul = read_soul(app).unwrap_or_default();
        obj.insert(
            "soul".to_string(),
            serde_json::to_value(soul).map_err(|e| e.to_string())?,
        );
    }

    if scope
        .get("configs")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        let mut cfg_map = Map::new();
        for (app_id, raw) in list_all_app_configs().map_err(|e| e.to_string())? {
            let parsed: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
            cfg_map.insert(app_id, parsed);
        }
        obj.insert("appConfigs".to_string(), Value::Object(cfg_map));
    }

    if scope
        .get("strategies")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        let strategies: Vec<ActiveStrategy> =
            local_db::get_strategies().map_err(|e| e.to_string())?;
        obj.insert(
            "strategies".to_string(),
            serde_json::to_value(strategies).map_err(|e| e.to_string())?,
        );
    }

    let mut bytes = serde_json::to_vec(&Value::Object(obj.clone())).map_err(|e| e.to_string())?;
    if bytes.len() < 127 {
        let pad = 127usize.saturating_sub(bytes.len());
        obj.insert(
            "_snapshotPad".to_string(),
            Value::String(" ".repeat(pad)),
        );
        bytes = serde_json::to_vec(&Value::Object(obj)).map_err(|e| e.to_string())?;
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_version_constant() {
        assert_eq!(SNAPSHOT_VERSION, 2);
    }
}
