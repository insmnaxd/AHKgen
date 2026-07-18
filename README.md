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
- **AutoHotkey v1 and v2** – Switch output version instantly without recreating entries
- **Physical Input Capture** – Press keyboard and mouse buttons directly
- **Full-size Keyboard and Mouse Schemes**
- **Keyboard Layout Support** – QWERTY, QWERTZ, AZERTY
- **Light/Dark Mode** – Automatically follows system settings

### Technical Features
- Input validation and error prevention
- Lightweight thanks to Tauri + WebView2

---

## 📥 Download

Download the latest release from the [GitHub Releases](https://github.com/insmnaxd/AHKgen/releases) page.

AHKgen is built for Windows. AutoHotkey v1 or v2 is required, matching the version selected in the application.

---

## 🚀 Quick Start

1. Choose **AutoHotkey v1 or v2**, then select **Hotkeys**, **Hotstrings**, or **Remapping**.
2. Configure the entry. In Hotkeys and Remapping, select keys on screen or click the selection field and press them physically.
3. Add the entry. Click an item in its list to edit it later.
4. Review the generated AutoHotkey code in **Script preview**.
5. Copy the code or save it as an `.ahk` file and run it with the selected AutoHotkey version.

Use **Open existing .ahk file** to continue editing a script previously created by AHKgen. Unsupported or manually altered blocks may be skipped during import.

---

## 🧑‍💻 Built With

- **Frontend**: HTML, CSS, JavaScript (Tauri)
- **Backend**: Rust
- **Renderer**: WebView2 (Windows)

---

## 📄 License

AHKgen is licensed under the [MIT License](./LICENSE).
