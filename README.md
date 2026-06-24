# AHKgen

**A simple and intuitive GUI tool for generating AutoHotkey (AHK) scripts.**

AHKgen allows you to quickly create hotkeys, hotstrings, key remaps, and "send text" actions without writing AHK code manually.

---

## ✨ Features

- **Hotkeys** – Create combinations with modifiers
- **Hotstrings** – Auto-replace text
- **Key Remapping** – Easily remap one key to another
- **Send Text** – Insert text (supports multiple lines and newlines)
- **Open URL** and **Run Command** actions
- **Import & Edit** existing AHKgen-generated scripts
- **Keyboard Layout Support** – QWERTY, QWERTZ, AZERTY
- **Light/Dark Mode** – Automatically follows system settings

### Technical Features
- Input validation and error prevention
- Lightweight thanks to Tauri + WebView2

---

## 📥 Download

Download the latest release from the [GitHub Releases](https://github.com/insmnaxd/AHKgen/releases) page.

---

## 🧑‍💻 Built With

- **Frontend**: HTML, CSS, JavaScript (Tauri)
- **Backend**: Rust
- **Renderer**: WebView2 (Windows)

---

## Testing

Run the fast unit and round-trip tests:

```powershell
npm test
```

Run integration tests against an installed AutoHotkey v1 interpreter:

```powershell
npm run test:ahk
```

The integration suite detects standard v1 installations under
`%LOCALAPPDATA%\Programs\AutoHotkey`. For a custom installation, provide the
executable explicitly:

```powershell
$env:AHK_V1_PATH = "C:\path\to\AutoHotkeyU64.exe"
npm run test:ahk
```

If AutoHotkey v1 is unavailable, the integration tests are skipped.
