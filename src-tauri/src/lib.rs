// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::menu::{MenuBuilder, SubmenuBuilder};
use tauri::Emitter;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            // First submenu = app menu on macOS. Use custom "About" that emits event (no native About).
            let app_submenu = SubmenuBuilder::new(app, "SHADOW Protocol")
                .text("show-about", "About SHADOW Protocol")
                .separator()
                .quit()
                .build()?;

            #[cfg(target_os = "macos")]
            let edit_submenu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .separator()
                .select_all()
                .build()?;

            #[cfg(target_os = "macos")]
            let window_submenu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .fullscreen()
                .separator()
                .close_window()
                .build()?;

            #[cfg(target_os = "macos")]
            let menu = MenuBuilder::new(app)
                .item(&app_submenu)
                .item(&edit_submenu)
                .item(&window_submenu)
                .build()?;

            #[cfg(not(target_os = "macos"))]
            let menu = MenuBuilder::new(app).item(&app_submenu).build()?;

            app.set_menu(menu)?;

            app.on_menu_event(move |app_handle, event| {
                if event.id().as_ref() == "show-about" {
                    let _ = app_handle.emit("show-about", ());
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
