//! Wallet sync commands: trigger background sync, get status.

use serde::Serialize;
use tauri::AppHandle;

use crate::commands;
use crate::services::local_db;
use crate::services::wallet_sync as sync_service;

const SYNC_STALE_SECS: i64 = 300; // 5 minutes

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletSyncStatusItem {
    pub address: String,
    pub last_synced_at: Option<i64>,
    pub sync_status: String,
    pub needs_sync: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletSyncStatusResult {
    pub wallets: Vec<WalletSyncStatusItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletSyncStartResult {
    pub started: bool,
    pub count: usize,
}

#[tauri::command]
pub fn wallet_sync_status(app: AppHandle) -> Result<WalletSyncStatusResult, String> {
    let addresses = commands::get_addresses(&app);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let mut wallets = Vec::new();
    for addr in &addresses {
        let last_synced = local_db::get_wallet_last_synced(addr).map_err(|e| e.to_string())?;
        let needs_sync = last_synced
            .map(|ts| now - ts > SYNC_STALE_SECS)
            .unwrap_or(true);
        let status = if needs_sync { "idle" } else { "done" };
        wallets.push(WalletSyncStatusItem {
            address: addr.clone(),
            last_synced_at: last_synced,
            sync_status: status.to_string(),
            needs_sync,
        });
    }
    Ok(WalletSyncStatusResult { wallets })
}

#[tauri::command]
pub async fn wallet_sync_start(
    app: AppHandle,
    addresses: Option<Vec<String>>,
) -> Result<WalletSyncStartResult, String> {
    let addrs = addresses.unwrap_or_else(|| commands::get_addresses(&app));
    let addrs: Vec<String> = addrs
        .into_iter()
        .filter(|a| a.trim().starts_with("0x") && a.len() == 42)
        .collect();

    if addrs.is_empty() {
        return Ok(WalletSyncStartResult {
            started: false,
            count: 0,
        });
    }

    let count = addrs.len();
    let _ = crate::services::settings::get_alchemy_key_or_env();
    for (i, addr) in addrs.into_iter().enumerate() {
        let app_handle = app.clone();
        tokio::spawn(async move {
            sync_service::sync_wallet(app_handle, addr, i, count).await;
        });
    }

    Ok(WalletSyncStartResult {
        started: true,
        count,
    })
}
