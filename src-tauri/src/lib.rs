// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;
mod session;
mod services;

use tauri::{Manager, RunEvent};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Opens the webview inspector (parity with browser devtools; Tauri also wires Cmd+Option+I / Ctrl+Shift+I via the webview plugin when devtools are enabled).
#[tauri::command]
fn open_devtools(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found.".to_string())?;
    window.open_devtools();
    Ok(())
}

/// Closes the webview inspector if it is open.
#[tauri::command]
fn close_devtools(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found.".to_string())?;
    window.close_devtools();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_target(false)
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_biometry::init())
        .setup(|app| {
            if let Ok(dir) = app.path().app_data_dir() {
                let db_path = dir.join("shadow_data.db");
                let _ = services::local_db::init(&db_path);
            }
            let handle = app.handle().clone();
            let restore_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let _ = services::apps::filecoin::restore_latest_snapshot(&restore_handle).await;
            });
            services::shadow_watcher::start(handle.clone());
            services::alpha_service::start(handle.clone());
            services::heartbeat::start(handle.clone());
            services::market_service::start(handle.clone());
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
                loop {
                    interval.tick().await;
                    session::prune_expired();
                }
            });

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
            open_devtools,
            close_devtools,
            commands::chat_agent,
            commands::approve_agent_action,
            commands::reject_agent_action,
            commands::get_pending_approvals,
            commands::get_execution_log,
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
            commands::delete_all_data,
            commands::portfolio_fetch_balances,
            commands::portfolio_fetch_balances_multi,
            commands::portfolio_fetch_transactions,
            commands::portfolio_fetch_nfts,
            commands::portfolio_fetch_history,
            commands::portfolio_fetch_allocations,
            commands::portfolio_fetch_performance_summary,
            commands::market_fetch_opportunities,
            commands::market_refresh_opportunities,
            commands::market_get_opportunity_detail,
            commands::market_prepare_opportunity_action,
            commands::portfolio_transfer,
            commands::portfolio_transfer_background,
            commands::check_ollama_status,
            commands::install_ollama,
            commands::pull_model,
            commands::start_ollama_service,
            commands::get_system_info,
            commands::delete_model,
            commands::get_agent_soul,
            commands::update_agent_soul,
            commands::get_agent_memory,
            commands::add_agent_memory,
            commands::remove_agent_memory,
            commands::get_command_log,
            commands::get_strategies,
            commands::create_strategy,
            commands::update_strategy,
            commands::strategy::strategy_compile_draft,
            commands::strategy::strategy_create_from_draft,
            commands::strategy::strategy_update_from_draft,
            commands::strategy::strategy_get,
            commands::strategy::strategy_get_execution_history,
            commands::update_strategy_status,
            commands::pause_strategy,
            commands::resume_strategy,
            commands::delete_strategy,
            commands::run_strategy_simulation,
            commands::get_strategy_executions,
            commands::apps_marketplace_list,
            commands::apps_install,
            commands::apps_uninstall,
            commands::apps_set_enabled,
            commands::apps_set_config,
            commands::apps_get_config,
            commands::apps_list_backups,
            commands::apps_runtime_health,
            commands::apps_refresh_health,
            commands::apps_lit_wallet_status,
            commands::apps_lit_mint_pkp,
            commands::apps_lit_pkp_address,
            commands::apps_flow_account_status,
            commands::apps_filecoin_auto_restore,
            commands::apps_set_secret,
            commands::apps_remove_secret,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app, event| {
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                session::clear_all();
            }
        });
}
