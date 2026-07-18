# Changelog

All notable changes in this project will be documented in this file.

See [ROADMAP.md](./ROADMAP.md) for planned features and ideas.


## [1.0.0-alpha.9] - 2026-07-18

### Added

- AutoHotkey v2 generation, import, and real-interpreter validation.
- AHK v1/v2 switch.
- Content Security Policy for local assets and Tauri IPC.
- Selective keyboard navigation and ARIA semantics for tabs, forms, lists, and status messages.

### Changed

- AutoHotkey v2 is now selected by default on new installations.
- The Hotstrings replacement field now grows automatically for multiline text.
- Generated v1 scripts now declare AutoHotkey v1.1.33 or newer as a requirement.

### Fixed

- Improved window and visual keyboard scaling across Windows DPI settings.

## [1.0.0-alpha.8] - 2026-06-30

### Added

- Warning before closing the application with unsaved script changes.
- About section with project, version, author, license, and repository information.
- Quick-start manual.

### Changed

- Corrected QWERTZ and AZERTY keyboard layouts.

### Fixed

- Rapidly removing multiple entries no longer risks deleting the wrong entry.

## [1.0.0-alpha.7] - 2026-06-30

### Added

- Mouse scheme.

### Changed

- Improved rendering of keyboard scheme in `Hotkeys` and `Remapping`.
- Expanded keyboard scheme to resemble a full-sized keyboard.
- Adjusted default size of the application window.

## [1.0.0-alpha.6] - 2026-06-26

### Added

- Capture mode; physical keyboard and mouse buttons can now be used for input in `Hotkeys` and `Remapping`.

### Changed

- Remade `Hotkeys` and `Remapping` key selection UX and UI to fit Capture mode.
- Script header is now remade during import.
- Unrecognized syntax and options are now skipped when importing a tampered .ahk file; the file is only rejected if nothing recognizable remains.

### Fixed

- UI can only be interacted with mouse from now on.
- Blocked WebView2 shortcuts and context menu.

## [1.0.0-alpha.5] - 2026-06-25

### Added

- Testing of generated .ahk scripts against real AHK v1 interpreter.

### Changed

- Phase four of refactoring; separated UI and domain logic from `main.js`.

### Fixed

- Improved hotstring generation.
- `Run` generation now correctly handles `%`.

## [1.0.0-alpha.4] - 2026-06-24

### Changed

- Phase three of refactoring; separated tabs, forms and lists from `main.js`.
- Expanded round-trip tests of `Send`, `Run`, `URL` and `Command` options in `Hotkeys`.

## [1.0.0-alpha.3] - 2026-06-24

### Changed

- Phase two of refactoring; separated i18n and GUI modules from `main.js`.

### Removed

- Removed unused Rust commands, Tauri plugins, Cargo dependencies and permissions.

### Fixed

- `Path` and `URL` generation now correctly handles commas (`,`).
- Fixed duplicate detection in `Hotstrings` mode.
- Fixed parsing of whitespace characters.

## [1.0.0-alpha.2] - 2026-06-24

### Changed

- Phase one of refactoring; separated AHK logic, generator, parsing and user config from `main.js`.
- Hotstrings containing a colon (`:`) are now allowed and parsed correctly.

### Fixed

- Fixed parsing issues with curly braces (`{}`).
- Fixed parsing issues with `Send` text string being next to a `%` character.

## [1.0.0-alpha.1] - 2026-06-24

### Added

- `Settings` tab.
- `Reset configuration` button.
- Animations on the item lists.
- Spanish :es: translation.
- German :de: translation.
- French :fr: translation.
- Italian :it: translation.
- Portuguese :portugal: translation.

### Changed

- Moved language selection to the `Settings` tab.
- Adjusted how lists display their items.
- Items can now be modified by directly clicking on them.
- Items expand on hover and on edit if their description exceeds a single line of text.

## [1.0.0-alpha.0] - 2026-06-23

### Added

- Language selection.
- Default language inherits browser's language.
- English :uk: is set as the fallback language if browser's language is not supported.
- Polish :poland: translation.
- Configuration file:
    - Saves the theme.
    - Saves the keyboard layout.
    - Saves the language.
- Validation:
    - Prevent creating hotstrings containing a colon (`:`).

### Changed

- Moved `L/R mode` and keyboard layout option to `Hotkeys` and `Remapping` tabs.
- Key input fields are no longer selectable.
- Blocked text selection in non-editable areas.
- Adjusted dark theme colours.

### Fixed

- `AltGr` no longer toggles `Alt` with `L/R mode` disabled.
- `Alt` now produces `!` in `L/R mode`.

## [0.9.3] - 2026-06-23

### Changed

- Initial window height and width is now controlled by `lib.rs` rather than `tauri.conf.json`.
- Further improved version control.

## [0.9.2] - 2026-06-22

### Changed

- Title bar is now independent from Windows default window appearance.
- Adjusted version control.

## [0.9.1] - 2026-06-22

### Fixed

- Hotstring generation.

## [0.9.0] - 2026-06-22

### Added

- Added light theme.
- Added a button to switch between dark and light themes.
- App reads the initial theme from system settings.

## [0.8.0] - 2026-06-21

### Added

- Added dynamic indicator of existing macros per category.
- Keyboard layout choice:
    - QWERTY
    - QWERTZ
    - AZERTY
- Default `SendMode` can now be overridden with `Event` if `Input` doesn't work for a specific text string.

### Changed

- `Send text` supports newlines and multiple text lines again.

### Fixed

- Keyboard GUI now clears properly after a hotkey or remap is added.

## [0.7.0] - 2026-06-20

AHKgen is now on GitHub.

### Fixed

- Fixed low-res app icon appearance on Windows

## [0.6.0] - 2026-06-20

### Added

- App icon.
- Key remapping.
- Raw text option in `Hotstrings`.
- Set initial window height to 75% and width to 40%.

### Changed

- Multiple regular keys can no longer be selected simultaneously.

## [0.5.0] - 2026-06-19

AHKgen went through a major revision and was completely rebuilt, moving from Python to Tauri framework. App runs on WebView2, drastically reducing memory and storage usage.

### Added

- `Hotkeys` tab:
    - Open URL
    - Run command
- Optional comments
- Script generation:
    - General header to indicate that the script was made using this app (used in above-mentioned validation check)
    - AHK version indicator
    - Default header:
        ```
        #NoEnv
        #SingleInstance
        SendMode, Input
        SetWorkingDir, %A_ScriptDir%
        ```
- Validation:
    - App checks whether an .ahk file was made with it and refuse to load it if it was not.

### Changed

- GUI is now dark.

### Removed

- Temporarily reduced `Send text` capabilities until a new solution regarding UI is found:
    - Newline is no longer supported.
    - Input field reduces to a single line.

## [0.4.0] - 2025-11-12

### Removed

- Deleted underline from selected items on the hotkey list.

### Fixed

- Fixed `AltGr` issues.
- `L/R mode` checkbox switches itself in edit mode depending on hotkeys used.

## [0.3.0] - 2025-11-11

### Added

- Mode selection.
- `Hotstrings` mode.
- Three options in `Hotstrings` mode:
    - Trigger instantly
    - Case sensitive
    - Trigger inside words
- `Distinguish L/R keys` option.
- Existing .ahk file import.

### Changed

- Rebuilt app structure.
- Slightly adjusted item editing.
- Revamped pop-ups again (auto size, pop-up types).

## [0.2.0] - 2025-11-10

### Added

- `About` button.
- `Paste from Clipboard` button.
- Blue colour for modifiers.
- Validation:
    - Prevent adding a hotkey when no regular key is selected.
    - Prevent adding a hotkey when no modifier key is selected.
    - Prevent adding a hotkey when too many regular keys are selected.
    - Prevent adding a hotkey when it is already assigned.

### Changed

- Keys are now toggleable.
- Toggled keys change their colour to darker.
- Error pop-ups now always appear in the middle of the main window.

### Fixed

- Separated `Alt` from `AltGr` as AHK treats them as two different keys.

## [0.1.0] - 2025-11-07

Initial release in Python language (backend + tkinter frontend).

### Added

- Basic GUI with QWERTY keyboard scheme.
- Text-based `SendInput` function.
- Saving hotkeys to .ahk.
- List of current hotkeys.
- Editing existing AHK scripts generated by this program.
- Support for 4 modifiers: `Ctrl`, `Shift`, `Alt`, `Win`.
- Validation:
    - Error message when .ahk file cannot be saved.
    - Error message when .ahk file cannot be opened.
    - Prevent adding a hotkey when no text is typed and or no keys are selected.
    - Prevent saving an .ahk file with no hotkeys created.
