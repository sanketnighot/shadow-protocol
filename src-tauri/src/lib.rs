// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;
mod session;
mod services;

use tauri::{Manager, RunEvent};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_biometry::init())
        .setup(|app| {
            if let Ok(dir) = app.path().app_data_dir() {
                let db_path = dir.join("shadow_data.db");
                let _ = services::local_db::init(&db_path);
            }
            let handle = app.handle().clone();
            services::shadow_watcher::start(handle.clone());

            tauri::async_runtime::spawn(async move {
                let addresses = commands::get_addresses(&handle);
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);
                const STALE_SECS: i64 = 300;
                let to_sync: Vec<String> = addresses
                    .into_iter()
                    .filter(|a| {
                        services::local_db::get_wallet_last_synced(a)
                            .map(|ts| ts.map(|t| now - t > STALE_SECS).unwrap_or(true))
                            .unwrap_or(true)
                    })
                    .collect();
                let count = to_sync.len();
                for (i, addr) in to_sync.into_iter().enumerate() {
                    let h = handle.clone();
                    tokio::spawn(async move {
                        services::wallet_sync::sync_wallet(h, addr, i, count).await;
                    });
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::chat_agent,
            commands::approve_agent_action,
            commands::wallet_create,
            commands::wallet_import_mnemonic,
            commands::wallet_import_private_key,
            commands::wallet_list,
            commands::wallet_remove,
            commands::wallet_sync_status,
            commands::wallet_sync_start,
            commands::session_unlock,
            commands::session_lock,
            commands::session_status,
            commands::set_perplexity_key,
            commands::get_perplexity_key,
            commands::remove_perplexity_key,
            commands::set_alchemy_key,
            commands::get_alchemy_key,
            commands::remove_alchemy_key,
            commands::set_ollama_key,
            commands::get_ollama_key,
            commands::remove_ollama_key,
            commands::portfolio_fetch_balances,
            commands::portfolio_fetch_balances_multi,
            commands::portfolio_fetch_transactions,
            commands::portfolio_fetch_nfts,
            commands::portfolio_transfer,
            commands::portfolio_transfer_background,
            commands::check_ollama_status,
            commands::install_ollama,
            commands::pull_model,
            commands::start_ollama_service,
            commands::get_system_info,
            commands::delete_model,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app, event| {
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                session::clear_all();
            }
        });
}
