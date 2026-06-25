// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
mod windows_key_capture {
    use serde::Serialize;
    use std::ptr::null;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{mpsc, OnceLock};
    use tauri::{AppHandle, Emitter};
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{VK_LWIN, VK_RWIN};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, SetWindowsHookExW, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL,
        WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    static ENABLED: AtomicBool = AtomicBool::new(false);
    static LEFT_DOWN: AtomicBool = AtomicBool::new(false);
    static RIGHT_DOWN: AtomicBool = AtomicBool::new(false);
    static EVENT_SENDER: OnceLock<mpsc::Sender<NativeWindowsKeyEvent>> = OnceLock::new();
    static HOOK_INSTALLED: AtomicBool = AtomicBool::new(false);

    #[derive(Clone, Copy)]
    struct NativeWindowsKeyEvent {
        code: &'static str,
        pressed: bool,
    }

    #[derive(Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct NativeWindowsKeyPayload {
        code: &'static str,
        pressed: bool,
    }

    unsafe extern "system" fn keyboard_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            let event = &*(lparam as *const KBDLLHOOKSTRUCT);
            let (key_code, down_state) = match event.vkCode as u16 {
                VK_LWIN => ("MetaLeft", &LEFT_DOWN),
                VK_RWIN => ("MetaRight", &RIGHT_DOWN),
                _ => return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam),
            };
            let message = wparam as u32;
            let pressed = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
            let released = message == WM_KEYUP || message == WM_SYSKEYUP;
            let enabled = ENABLED.load(Ordering::Relaxed);

            if pressed && enabled {
                if !down_state.swap(true, Ordering::Relaxed) {
                    let _ = EVENT_SENDER.get().map(|sender| {
                        sender.send(NativeWindowsKeyEvent {
                            code: key_code,
                            pressed: true,
                        })
                    });
                }
                return 1;
            }

            if released && down_state.swap(false, Ordering::Relaxed) {
                let _ = EVENT_SENDER.get().map(|sender| {
                    sender.send(NativeWindowsKeyEvent {
                        code: key_code,
                        pressed: false,
                    })
                });
                return 1;
            }
        }

        CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
    }

    pub fn install(app: AppHandle) -> Result<(), String> {
        let (sender, receiver) = mpsc::channel();
        EVENT_SENDER
            .set(sender)
            .map_err(|_| "Windows-key event channel was already initialized".to_string())?;

        std::thread::spawn(move || {
            while let Ok(event) = receiver.recv() {
                let _ = app.emit(
                    "native-windows-key",
                    NativeWindowsKeyPayload {
                        code: event.code,
                        pressed: event.pressed,
                    },
                );
            }
        });

        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        std::thread::spawn(move || {
            let hook = unsafe {
                SetWindowsHookExW(
                    WH_KEYBOARD_LL,
                    Some(keyboard_hook),
                    GetModuleHandleW(null()),
                    0,
                )
            };
            if hook.is_null() {
                let _ = ready_sender.send(false);
                return;
            }

            HOOK_INSTALLED.store(true, Ordering::Relaxed);
            let _ = ready_sender.send(true);

            let mut message: MSG = unsafe { std::mem::zeroed() };
            while unsafe { GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) } > 0 {}
        });

        match ready_receiver.recv() {
            Ok(true) => Ok(()),
            _ => Err("Could not install the Windows keyboard hook".to_string()),
        }
    }

    pub fn set_enabled(enabled: bool) -> bool {
        let available = HOOK_INSTALLED.load(Ordering::Relaxed);
        ENABLED.store(enabled && available, Ordering::Relaxed);
        available
    }
}

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
fn set_windows_key_capture(enabled: bool) -> bool {
    #[cfg(target_os = "windows")]
    {
        windows_key_capture::set_enabled(enabled)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = enabled;
        false
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            load_user_config,
            save_user_config,
            reset_user_config,
            set_windows_key_capture
        ])
        .setup(|app| {
            use tauri::Manager;

            #[cfg(target_os = "windows")]
            if let Err(error) = windows_key_capture::install(app.handle().clone()) {
                eprintln!("{error}");
            }

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
