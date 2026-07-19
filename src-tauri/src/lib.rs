// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const TARGET_WINDOW_WIDTH: f64 = 1200.0;
const TARGET_WINDOW_HEIGHT: f64 = 820.0;
const MAX_MONITOR_FRACTION: f64 = 0.90;

fn initial_window_size(monitor_width: u32, monitor_height: u32, scale_factor: f64) -> (f64, f64) {
    let safe_scale_factor = if scale_factor.is_finite() && scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    };
    let logical_monitor_width = monitor_width as f64 / safe_scale_factor;
    let logical_monitor_height = monitor_height as f64 / safe_scale_factor;
    let maximum_width = (logical_monitor_width * MAX_MONITOR_FRACTION).floor();
    let maximum_height = (logical_monitor_height * MAX_MONITOR_FRACTION).floor();

    (
        TARGET_WINDOW_WIDTH.min(maximum_width),
        TARGET_WINDOW_HEIGHT.min(maximum_height),
    )
}

#[cfg(target_os = "windows")]
mod windows_key_capture {
    use serde::Serialize;
    use std::collections::HashSet;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{mpsc, Mutex, OnceLock};
    use tauri::{AppHandle, Emitter};
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, SetWindowsHookExW, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL,
        WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    static ENABLED: AtomicBool = AtomicBool::new(false);
    static BLOCKED_KEYS: OnceLock<Mutex<HashSet<u32>>> = OnceLock::new();
    static EVENT_SENDER: OnceLock<mpsc::Sender<NativeKeyEvent>> = OnceLock::new();
    static HOOK_INSTALLED: AtomicBool = AtomicBool::new(false);

    #[derive(Clone, Copy)]
    struct NativeKeyEvent {
        code: &'static str,
        pressed: bool,
    }

    #[derive(Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct NativeKeyPayload {
        code: &'static str,
        pressed: bool,
    }

    const LLKHF_EXTENDED: u32 = 0x01;
    const DIGIT_CODES: [&str; 10] = [
        "Digit0", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8",
        "Digit9",
    ];
    const LETTER_CODES: [&str; 26] = [
        "KeyA", "KeyB", "KeyC", "KeyD", "KeyE", "KeyF", "KeyG", "KeyH", "KeyI", "KeyJ", "KeyK",
        "KeyL", "KeyM", "KeyN", "KeyO", "KeyP", "KeyQ", "KeyR", "KeyS", "KeyT", "KeyU", "KeyV",
        "KeyW", "KeyX", "KeyY", "KeyZ",
    ];
    const NUMPAD_CODES: [&str; 10] = [
        "Numpad0", "Numpad1", "Numpad2", "Numpad3", "Numpad4", "Numpad5", "Numpad6", "Numpad7",
        "Numpad8", "Numpad9",
    ];
    const FUNCTION_CODES: [&str; 24] = [
        "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "F13", "F14",
        "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23", "F24",
    ];

    fn vk_to_code(vk_code: u32, scan_code: u32, flags: u32) -> Option<&'static str> {
        if (0x30..=0x39).contains(&vk_code) {
            return Some(DIGIT_CODES[(vk_code - 0x30) as usize]);
        }
        if (0x41..=0x5A).contains(&vk_code) {
            return Some(LETTER_CODES[(vk_code - 0x41) as usize]);
        }
        if (0x60..=0x69).contains(&vk_code) {
            return Some(NUMPAD_CODES[(vk_code - 0x60) as usize]);
        }
        if (0x70..=0x87).contains(&vk_code) {
            return Some(FUNCTION_CODES[(vk_code - 0x70) as usize]);
        }

        let extended = flags & LLKHF_EXTENDED != 0;
        match vk_code {
            0x08 => Some("Backspace"),
            0x09 => Some("Tab"),
            0x0D if extended => Some("NumpadEnter"),
            0x0D => Some("Enter"),
            0x13 => Some("Pause"),
            0x14 => Some("CapsLock"),
            0x1B => Some("Escape"),
            0x20 => Some("Space"),
            0x21 => Some("PageUp"),
            0x22 => Some("PageDown"),
            0x23 => Some("End"),
            0x24 => Some("Home"),
            0x25 => Some("ArrowLeft"),
            0x26 => Some("ArrowUp"),
            0x27 => Some("ArrowRight"),
            0x28 => Some("ArrowDown"),
            0x2C => Some("PrintScreen"),
            0x2D => Some("Insert"),
            0x2E => Some("Delete"),
            0x5B => Some("MetaLeft"),
            0x5C => Some("MetaRight"),
            0x5D => Some("ContextMenu"),
            0x6A => Some("NumpadMultiply"),
            0x6B => Some("NumpadAdd"),
            0x6D => Some("NumpadSubtract"),
            0x6E => Some("NumpadDecimal"),
            0x6F => Some("NumpadDivide"),
            0x90 => Some("NumLock"),
            0x91 => Some("ScrollLock"),
            0x10 if scan_code == 0x36 => Some("ShiftRight"),
            0x10 => Some("ShiftLeft"),
            0x11 if extended => Some("ControlRight"),
            0x11 => Some("ControlLeft"),
            0x12 if extended => Some("AltRight"),
            0x12 => Some("AltLeft"),
            0xA0 => Some("ShiftLeft"),
            0xA1 => Some("ShiftRight"),
            0xA2 => Some("ControlLeft"),
            0xA3 => Some("ControlRight"),
            0xA4 => Some("AltLeft"),
            0xA5 => Some("AltRight"),
            0xBA => Some("Semicolon"),
            0xBB => Some("Equal"),
            0xBC => Some("Comma"),
            0xBD => Some("Minus"),
            0xBE => Some("Period"),
            0xBF => Some("Slash"),
            0xC0 => Some("Backquote"),
            0xDB => Some("BracketLeft"),
            0xDC => Some("Backslash"),
            0xDD => Some("BracketRight"),
            0xDE => Some("Quote"),
            _ => None,
        }
    }

    fn key_identity(event: &KBDLLHOOKSTRUCT) -> u32 {
        event.vkCode | ((event.flags & LLKHF_EXTENDED) << 24)
    }

    unsafe extern "system" fn keyboard_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            let event = &*(lparam as *const KBDLLHOOKSTRUCT);
            let key_code = match vk_to_code(event.vkCode, event.scanCode, event.flags) {
                Some(key_code) => key_code,
                None => return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam),
            };
            let message = wparam as u32;
            let pressed = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
            let released = message == WM_KEYUP || message == WM_SYSKEYUP;
            let enabled = ENABLED.load(Ordering::Relaxed);

            if pressed && enabled {
                let first_press = BLOCKED_KEYS
                    .get()
                    .map(|blocked_keys| {
                        blocked_keys
                            .lock()
                            .map(|mut keys| keys.insert(key_identity(event)))
                            .unwrap_or(true)
                    })
                    .unwrap_or(true);
                if first_press {
                    let _ = EVENT_SENDER.get().map(|sender| {
                        sender.send(NativeKeyEvent {
                            code: key_code,
                            pressed: true,
                        })
                    });
                }
                return 1;
            }

            if released {
                let was_blocked = BLOCKED_KEYS
                    .get()
                    .map(|blocked_keys| {
                        blocked_keys
                            .lock()
                            .map(|mut keys| keys.remove(&key_identity(event)))
                            .unwrap_or(false)
                    })
                    .unwrap_or(false);
                if was_blocked {
                    let _ = EVENT_SENDER.get().map(|sender| {
                        sender.send(NativeKeyEvent {
                            code: key_code,
                            pressed: false,
                        })
                    });
                    return 1;
                }
                if enabled {
                    return 1;
                }
            }
        }

        CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
    }

    pub fn install(app: AppHandle) -> Result<(), String> {
        let (sender, receiver) = mpsc::channel();
        BLOCKED_KEYS
            .set(Mutex::new(HashSet::new()))
            .map_err(|_| "Native key state was already initialized".to_string())?;
        EVENT_SENDER
            .set(sender)
            .map_err(|_| "Native key event channel was already initialized".to_string())?;

        std::thread::spawn(move || {
            while let Ok(event) = receiver.recv() {
                let _ = app.emit(
                    "native-key",
                    NativeKeyPayload {
                        code: event.code,
                        pressed: event.pressed,
                    },
                );
            }
        });

        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        std::thread::spawn(move || {
            let hook = unsafe {
                SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook), std::ptr::null_mut(), 0)
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
    ahk_version: Option<String>,
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
        .plugin(tauri_plugin_opener::init())
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
                    let (width, height) = initial_window_size(
                        screen_size.width,
                        screen_size.height,
                        monitor.scale_factor(),
                    );

                    let _ =
                        window.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }));

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

#[cfg(test)]
mod tests {
    use super::initial_window_size;

    #[test]
    fn keeps_the_target_logical_size_at_1080p_and_100_percent() {
        assert_eq!(initial_window_size(1920, 1080, 1.0), (1200.0, 820.0));
    }

    #[test]
    fn clamps_the_height_at_1080p_and_125_percent() {
        assert_eq!(initial_window_size(1920, 1080, 1.25), (1200.0, 777.0));
    }

    #[test]
    fn uses_ninety_percent_of_1080p_at_150_percent() {
        assert_eq!(initial_window_size(1920, 1080, 1.5), (1152.0, 648.0));
    }

    #[test]
    fn falls_back_to_a_safe_scale_factor() {
        assert_eq!(initial_window_size(1920, 1080, 0.0), (1200.0, 820.0));
    }
}
