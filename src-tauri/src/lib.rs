// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            use tauri::Manager;

            if let Some(window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let screen_size = monitor.size();

                    // 40% width, 75% height of the screen the window opens on.
                    // Adjust these two factors if you want a different starting size.
                    let width_factor = 0.40;
                    let height_factor = 0.75;

                    let new_width = (screen_size.width as f64 * width_factor) as u32;
                    let new_height = (screen_size.height as f64 * height_factor) as u32;

                    let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                        width: new_width,
                        height: new_height,
                    }));

                    // Re-center the window now that its size changed, so it doesn't end up
                    // anchored to a corner based on the size defined in tauri.conf.json.
                    let _ = window.center();
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}