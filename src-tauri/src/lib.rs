// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserConfig {
    language: Option<String>,
    theme: Option<String>,
    keyboard_layout: Option<String>,
}

fn user_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("Could not resolve app config directory: {err}"))?;

    Ok(config_dir.join("config.json"))
}

#[tauri::command]
fn load_user_config(app: AppHandle) -> Result<UserConfig, String> {
    let path = user_config_path(&app)?;

    if !path.exists() {
        return Ok(UserConfig::default());
    }

    let contents = fs::read_to_string(&path)
        .map_err(|err| format!("Could not read config file {}: {err}", path.display()))?;

    serde_json::from_str(&contents)
        .map_err(|err| format!("Could not parse config file {}: {err}", path.display()))
}

#[tauri::command]
fn save_user_config(app: AppHandle, config: UserConfig) -> Result<(), String> {
    let path = user_config_path(&app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            format!(
                "Could not create config directory {}: {err}",
                parent.display()
            )
        })?;
    }

    let contents = serde_json::to_string_pretty(&config)
        .map_err(|err| format!("Could not serialize config: {err}"))?;

    fs::write(&path, contents)
        .map_err(|err| format!("Could not write config file {}: {err}", path.display()))
}

#[tauri::command]
fn reset_user_config(app: AppHandle) -> Result<(), String> {
    let path = user_config_path(&app)?;

    if path.exists() {
        fs::remove_file(&path)
            .map_err(|err| format!("Could not delete config file {}: {err}", path.display()))?;
    }

    app.restart();
}

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
        .invoke_handler(tauri::generate_handler![
            greet,
            load_user_config,
            save_user_config,
            reset_user_config
        ])
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
