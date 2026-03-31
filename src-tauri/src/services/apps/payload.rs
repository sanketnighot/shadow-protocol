//! Shared non-secret payload builders for app adapters.

use serde_json::{Map, Value};
use tauri::AppHandle;

use crate::services::agent_state::{read_memory, read_soul};
use crate::services::apps::state::list_all_app_configs;
use crate::services::local_db::{self, ActiveStrategy, PortfolioSnapshot};

/// Snapshot format version written to Filecoin backup payloads.
pub const SNAPSHOT_VERSION: u64 = 2;

const BACKUP_TX_LIMIT: i64 = 100;
const BACKUP_SNAPSHOT_LIMIT: u32 = 50;

/// Build a JSON snapshot for upload from scope flags (merged from user config + job defaults).
/// `wallet_addresses` is used for transaction history scope (EVM addresses in `wallets.json`).
pub fn backup_payload_from_scope(
    app: &AppHandle,
    scope: &Value,
    wallet_addresses: &[String],
) -> Result<Vec<u8>, String> {
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

    if scope
        .get("transactionHistory")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        let mut arr = Vec::new();
        for w in wallet_addresses {
            let w = w.trim();
            if w.is_empty() {
                continue;
            }
            let per = local_db::get_transactions_for_wallets(&[w.to_string()], Some(BACKUP_TX_LIMIT))
                .map_err(|e| e.to_string())?;
            for r in per {
                arr.push(serde_json::json!({
                    "walletAddress": w,
                    "id": r.id,
                    "txHash": r.tx_hash,
                    "chain": r.chain,
                    "fromAddr": r.from_addr,
                    "toAddr": r.to_addr,
                    "value": r.value,
                    "blockNumber": r.block_number,
                    "timestamp": r.timestamp,
                    "category": r.category,
                    "metadata": r.metadata,
                }));
            }
        }
        obj.insert("transactionHistory".to_string(), Value::Array(arr));
    }

    if scope
        .get("portfolioSnapshots")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        let snaps: Vec<PortfolioSnapshot> =
            local_db::get_portfolio_snapshots(BACKUP_SNAPSHOT_LIMIT).map_err(|e| e.to_string())?;
        obj.insert(
            "portfolioSnapshots".to_string(),
            serde_json::to_value(snaps).map_err(|e| e.to_string())?,
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
