// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;
mod session;

use tauri::RunEvent;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_biometry::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::wallet_create,
            commands::wallet_import_mnemonic,
            commands::wallet_import_private_key,
            commands::wallet_list,
            commands::wallet_remove,
            commands::session_unlock,
            commands::session_lock,
            commands::session_status,
            commands::portfolio_fetch_balances,
            commands::portfolio_transfer,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app, event| {
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                session::clear_all();
            }
        });
}
