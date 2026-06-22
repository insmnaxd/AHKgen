const { writeTextFile, readTextFile } = window.__TAURI__.fs;
const { save, open } = window.__TAURI__.dialog;
const { writeText } = window.__TAURI__.clipboardManager;
const { getCurrentWindow } = window.__TAURI__.window;

// --- App state ---
let hotkeys = [];
let remaps = [];
let hotstrings = [];

let currentMode = "hotkeys"; // "hotkeys" | "remap"

// Hotkeys mode: visual keyboard state
let selectedModifiers = new Set();
let selectedKey = null;

// Remap mode: visual keyboard state (two independent key selections: from / to)
let remapActiveTarget = "from"; // "from" | "to"
let remapFromMods = new Set();
let remapFromKey = null;
let remapToMods = new Set();
let remapToKey = null;

// Edit state: index of the entry currently being edited, or null if adding a new one
let editingIndex = null; // for hotkeys
let editingRemapIndex = null; // for remaps
let editingHotstringIndex = null; // for hotstrings

// --- DOM elements ---
let modeTabs;
let keyboardLayoutSelect;
let themeToggleCheckbox;
let sendModeEventToggle, sendModeGroup;
let tabBadgeHotkeys, tabBadgeHotstrings, tabBadgeRemap;
let distinguishSidesToggle;
let modeSectionHotkeys, modeSectionHotstrings, modeSectionRemap;
let listSectionHotkeys, listSectionHotstrings, listSectionRemap;

let keyboardEl;
let selectedHotkeyDisplay;
let clearHotkeyBtn;
let formTitle;
let actionType;
let actionValueGroup, actionValueLabel, actionValue, actionValueHint;
let commentInput;
let addBtn, cancelEditBtn, formError;
let browseFileBtn;
let hotkeyListEl, hotkeyCountEl;

let hotstringTriggerInput, hotstringReplacementInput;
let hotstringOptAuto, hotstringOptCase, hotstringOptInside, hotstringOptRaw;
let hotstringCommentInput;
let addHotstringBtn, cancelHotstringEditBtn, hotstringFormError;
let hotstringFormTitle;
let hotstringListEl, hotstringCountEl;

let keyboardRemapEl;
let remapTargetFromBtn, remapTargetToBtn;
let remapFromDisplay, remapToDisplay;
let remapCommentInput;
let addRemapBtn, cancelRemapEditBtn, remapFormError;
let remapFormTitle;
let remapListEl, remapCountEl;

let scriptPreviewEl;
let copyBtn, saveBtn, openFileBtn, actionStatusEl;

// Field configuration for each action type (labels, placeholders, hints)
const ACTION_CONFIG = {
  send: {
    label: "Text to send",
    placeholder: "Enter text...",
    hint: "This text will be typed when the hotkey is pressed.",
  },
  run: {
    label: "Path to app / file",
    placeholder: 'e.g. "C:\\Program Files\\Notepad++\\notepad++.exe"',
    hint: "Full path to the program or file that should be opened.",
  },
  url: {
    label: "URL address",
    placeholder: "e.g. https://github.com",
    hint: "Web address that will open in the default browser.",
  },
  command: {
    label: "Command to run",
    placeholder: "e.g. shutdown /s /t 0",
    hint: "Raw system command that will be executed (Run).",
  },
};

// Whether to distinguish left/right variants of Ctrl, Shift, Alt, Win (global setting)
let distinguishSides = false;

// Maps a *generic* modifier name to its AHK v1 symbol (used when distinguishSides is off)
const MODIFIER_SYMBOLS = {
  Ctrl: "^",
  Alt: "!",
  Shift: "+",
  Win: "#",
};

// Maps a *side-specific* key name to its AHK v1 left/right-aware symbol (used when distinguishSides is on).
// AltGr is physically LCtrl+RAlt on most layouts, hence the combined symbol.
const SIDE_MODIFIER_SYMBOLS = {
  LCtrl: "<^",
  RCtrl: ">^",
  LAlt: "<!",
  RAlt: ">!",
  LShift: "<+",
  RShift: ">+",
  LWin: "<#",
  RWin: ">#",
  AltGr: "<^>!",
};

// Every side-specific key name maps back to its generic family, used when distinguishSides is off
// (e.g. LCtrl and RCtrl both collapse down to the generic "Ctrl" symbol).
const SIDE_KEY_TO_GENERIC = {
  LCtrl: "Ctrl",
  RCtrl: "Ctrl",
  LAlt: "Alt",
  RAlt: "Alt",
  LShift: "Shift",
  RShift: "Shift",
  LWin: "Win",
  RWin: "Win",
  AltGr: "Alt", // when not distinguishing sides, AltGr is treated as a plain Alt press
};

// All recognized modifier key names (side-specific identifiers used as data-key values on buttons)
const ALL_MODIFIER_KEYS = ["LCtrl", "RCtrl", "LAlt", "RAlt", "LShift", "RShift", "LWin", "RWin", "AltGr"];

// Reverse lookup: any AHK prefix symbol sequence -> side-specific key name (longest match first).
// Ordered so that multi-character symbols like "<^>!" and "<^" are tried before single-char ones.
const PREFIX_SYMBOL_TABLE = [
  ["<^>!", "AltGr"],
  ["<^", "LCtrl"],
  [">^", "RCtrl"],
  ["<!", "LAlt"],
  [">!", "RAlt"],
  ["<+", "LShift"],
  [">+", "RShift"],
  ["<#", "LWin"],
  [">#", "RWin"],
  ["^", "Ctrl"],
  ["!", "Alt"],
  ["+", "Shift"],
  ["#", "Win"],
];

// --- Shared helpers: building/parsing a "modifiers + key" prefix string ---
// `mods` is always a Set of side-specific key names (e.g. "LCtrl", "RShift", "AltGr").
// Whether the *output* symbol is side-specific or generic depends on distinguishSides.

function buildPrefix(mods, key) {
  let prefix = "";

  if (distinguishSides) {
    // Side-specific output, in a stable order: Ctrl, Alt, Shift, Win variants, then AltGr
    for (const modKey of ["LCtrl", "RCtrl", "LAlt", "RAlt", "LShift", "RShift", "LWin", "RWin", "AltGr"]) {
      if (mods.has(modKey)) prefix += SIDE_MODIFIER_SYMBOLS[modKey];
    }
  } else {
    // Generic output: collapse any side-specific key down to its family, de-duplicating.
    // AltGr is the one exception - it always keeps its special <^>! symbol, never collapsing
    // to a plain Alt, since it's a physically distinct key combination.
    const generic = new Set();
    mods.forEach((modKey) => {
      if (modKey === "AltGr") return; // handled separately below
      generic.add(SIDE_KEY_TO_GENERIC[modKey] || modKey);
    });
    if (generic.has("Ctrl")) prefix += MODIFIER_SYMBOLS.Ctrl;
    if (generic.has("Alt")) prefix += MODIFIER_SYMBOLS.Alt;
    if (generic.has("Shift")) prefix += MODIFIER_SYMBOLS.Shift;
    if (generic.has("Win")) prefix += MODIFIER_SYMBOLS.Win;
    if (mods.has("AltGr")) prefix += SIDE_MODIFIER_SYMBOLS.AltGr;
  }

  if (key) prefix += key;
  return prefix;
}

// Parses a prefix string (e.g. "<^+j" or "^+j") back into modifiers + main key.
// Recognizes both generic and side-specific symbols regardless of the current distinguishSides setting,
// so existing entries display correctly even if the user toggles the setting afterwards.
function parsePrefix(prefix) {
  const mods = new Set();
  let rest = prefix;

  let matched = true;
  while (matched) {
    matched = false;
    for (const [symbol, modKey] of PREFIX_SYMBOL_TABLE) {
      if (rest.startsWith(symbol)) {
        mods.add(modKey);
        rest = rest.slice(symbol.length);
        matched = true;
        break;
      }
    }
  }

  return { mods, key: rest };
}

// Updates the visible label of every modifier button on both keyboards,
// switching between e.g. "Ctrl" and "L Ctrl" / "R Ctrl" depending on distinguishSides.
// --- Keyboard layout (QWERTY / QWERTZ / AZERTY) ---
// All button data-key attributes in the HTML are written in QWERTY (the base layout).
// Switching layouts remaps specific QWERTY letter keys to their physical equivalent
// in the chosen layout, both for the visible label and the underlying data-key used
// to build AHK prefixes - so the hotkey generated matches the physical key the user
// would actually press on that layout.
let currentKeyboardLayout = "qwerty";

// Each entry: QWERTY base key -> key in that layout. Only keys that actually move are listed.
const LAYOUT_KEY_MAPS = {
  qwerty: {},
  qwertz: { z: "y", y: "z" },
  azerty: { a: "q", q: "a", z: "w", w: "z" },
};

function applyKeyboardLayout(layout) {
  currentKeyboardLayout = layout;
  const map = LAYOUT_KEY_MAPS[layout] || {};

  [keyboardEl, keyboardRemapEl].forEach((kb) => {
    if (!kb) return;
    kb.querySelectorAll(".kb-key:not(.kb-modifier)").forEach((btn) => {
      const baseKey = btn.dataset.baseKey || btn.dataset.key; // remember the original QWERTY key
      if (!btn.dataset.baseKey) btn.dataset.baseKey = baseKey;

      // Only single-letter keys are affected by layout swaps (numbers, F-keys, etc. never move)
      if (baseKey.length === 1 && /[a-z]/i.test(baseKey)) {
        const mapped = map[baseKey] || baseKey;
        btn.dataset.key = mapped;
        btn.textContent = mapped.toUpperCase();
      }
    });
  });
}

function saveKeyboardLayoutPreference(layout) {
  try {
    localStorage.setItem("ahkgen.keyboardLayout", layout);
  } catch (err) {
    // localStorage can fail in rare environments (e.g. storage disabled) - not critical, just skip persisting
    console.warn("Could not save keyboard layout preference:", err);
  }
}

function loadKeyboardLayoutPreference() {
  try {
    return localStorage.getItem("ahkgen.keyboardLayout") || "qwerty";
  } catch (err) {
    return "qwerty";
  }
}

// --- Light / dark theme ---
// Default behavior: follow the OS setting (prefers-color-scheme). If the user manually
// toggles the theme button, that explicit choice is saved and permanently overrides
// the OS setting from then on (no "auto" state to go back to, by design).

function getSavedThemePreference() {
  try {
    return localStorage.getItem("ahkgen.theme"); // "light" | "dark" | null (never set)
  } catch (err) {
    return null;
  }
}

function saveThemePreference(theme) {
  try {
    localStorage.setItem("ahkgen.theme", theme);
  } catch (err) {
    console.warn("Could not save theme preference:", err);
  }
}

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggleCheckbox.checked = theme === "dark";
}

function handleThemeToggle() {
  const next = themeToggleCheckbox.checked ? "dark" : "light";
  applyTheme(next);
  saveThemePreference(next);
}

function initTheme() {
  const saved = getSavedThemePreference();
  if (saved === "light" || saved === "dark") {
    applyTheme(saved);
    return;
  }

  // No explicit user choice yet - follow the OS setting, and keep following it
  // live if the user changes their OS theme while the app is open.
  applyTheme(systemPrefersDark() ? "dark" : "light");

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      // Only react to OS changes if the user still hasn't made an explicit manual choice
      if (!getSavedThemePreference()) {
        applyTheme(e.matches ? "dark" : "light");
      }
    });
  }
}

function updateModifierLabels() {
  [keyboardEl, keyboardRemapEl].forEach((kb) => {
    if (!kb) return;
    kb.querySelectorAll(".kb-modifier").forEach((btn) => {
      const side = btn.dataset.side; // "L" | "R"
      const base = btn.dataset.base; // "Ctrl" | "Alt" | "Shift" | "Win" | "AltGr"

      // Only Ctrl and Shift get an L/R label change. Alt keeps its plain label
      // (LAlt vs AltGr are different physical keys, so we don't want "L Alt" suggesting
      // it's somehow related to AltGr). Win and AltGr never change their label either.
      const distinguishableLabels = ["Ctrl", "Shift"];

      if (!distinguishableLabels.includes(base)) {
        btn.textContent = base;
        return;
      }

      btn.textContent = distinguishSides ? `${side} ${base}` : base;
    });
  });
}

function setDistinguishSides(value) {
  distinguishSides = value;

  // Only clear the *modifier* selections on both keyboards (Ctrl/Alt/Shift/Win/AltGr) - switching
  // this setting changes what their symbols/labels mean. The main key (e.g. "j") is unaffected
  // by this setting, so we leave it selected.
  selectedModifiers.clear();
  remapFromMods.clear();
  remapToMods.clear();

  updateModifierLabels();
  updateKeyboardVisuals();
  updateSelectedHotkeyDisplay();
  updateRemapKeyboardVisuals();
  updateRemapDisplays();
}

// --- Hotkeys mode: visual keyboard logic ---

// Toggles a modifier within a given selection Set, correctly handling the "generic" mode:
// when distinguishSides is off, toggling EITHER the L or R button of a family (e.g. LCtrl/RCtrl)
// should affect the whole family together, since on the keyboard they represent one modifier.
function toggleModifierInSet(mods, modKey, base) {
  if (distinguishSides || base === "AltGr") {
    if (mods.has(modKey)) {
      mods.delete(modKey);
    } else {
      mods.add(modKey);
    }
    return;
  }

  // Generic mode: check if any L/R variant of this base is currently selected
  const familyKeys = ALL_MODIFIER_KEYS.filter((k) => SIDE_KEY_TO_GENERIC[k] === base);
  const isActive = familyKeys.some((k) => mods.has(k));

  if (isActive) {
    familyKeys.forEach((k) => mods.delete(k));
  } else {
    // Add a single representative (the one that was actually clicked) - buildPrefix
    // collapses it to the generic symbol regardless of which specific key is stored.
    mods.add(modKey);
  }
}

function toggleModifier(modKey) {
  const base = SIDE_KEY_TO_GENERIC[modKey] || modKey;
  toggleModifierInSet(selectedModifiers, modKey, base);
  updateKeyboardVisuals();
  updateSelectedHotkeyDisplay();
}

function selectKey(keyName) {
  // Clicking the already-selected key deselects it; clicking a different key replaces the selection.
  selectedKey = selectedKey === keyName ? null : keyName;
  updateKeyboardVisuals();
  updateSelectedHotkeyDisplay();
}

function clearHotkeySelection() {
  selectedModifiers.clear();
  selectedKey = null;
  updateKeyboardVisuals();
  updateSelectedHotkeyDisplay();
}

// Decides whether a given modifier button should be shown as "active", given the current
// selection set. When distinguishSides is off, both the L and R button of the same family
// (e.g. LCtrl and RCtrl) light up together, since they represent one and the same modifier.
// AltGr is always treated as its own distinct key in both modes.
function isModifierActive(btn, mods) {
  const key = btn.dataset.key; // e.g. "LCtrl", "RCtrl", "AltGr"
  const base = btn.dataset.base; // e.g. "Ctrl", "Alt", "Shift", "Win", "AltGr"

  if (distinguishSides || base === "AltGr") {
    return mods.has(key);
  }

  // Generic mode: light up if ANY key sharing this base is selected
  return [...mods].some((m) => (SIDE_KEY_TO_GENERIC[m] || m) === base);
}

function updateKeyboardVisuals() {
  const buttons = keyboardEl.querySelectorAll(".kb-key");
  buttons.forEach((btn) => {
    const key = btn.dataset.key;
    const isModifier = btn.classList.contains("kb-modifier");
    if (isModifier) {
      btn.classList.toggle("active", isModifierActive(btn, selectedModifiers));
    } else {
      btn.classList.toggle("active", selectedKey === key);
    }
  });
}

function buildHotkeyPrefix() {
  return buildPrefix(selectedModifiers, selectedKey);
}

function updateSelectedHotkeyDisplay() {
  selectedHotkeyDisplay.value = buildHotkeyPrefix();
}

// --- Remap mode: visual keyboard logic ---
// The same physical keyboard is used for both "from" and "to" - remapActiveTarget
// decides which selection set gets updated when a key is clicked.

function setRemapActiveTarget(target) {
  remapActiveTarget = target;
  remapTargetFromBtn.classList.toggle("active", target === "from");
  remapTargetToBtn.classList.toggle("active", target === "to");
  updateRemapKeyboardVisuals();
}

function toggleRemapModifier(modKey) {
  const mods = remapActiveTarget === "from" ? remapFromMods : remapToMods;
  const base = SIDE_KEY_TO_GENERIC[modKey] || modKey;
  toggleModifierInSet(mods, modKey, base);
  updateRemapKeyboardVisuals();
  updateRemapDisplays();
}

function selectRemapKey(keyName) {
  if (remapActiveTarget === "from") {
    remapFromKey = remapFromKey === keyName ? null : keyName;
  } else {
    remapToKey = remapToKey === keyName ? null : keyName;
  }
  updateRemapKeyboardVisuals();
  updateRemapDisplays();
}

function updateRemapKeyboardVisuals() {
  const mods = remapActiveTarget === "from" ? remapFromMods : remapToMods;
  const key = remapActiveTarget === "from" ? remapFromKey : remapToKey;

  const buttons = keyboardRemapEl.querySelectorAll(".kb-key");
  buttons.forEach((btn) => {
    const k = btn.dataset.key;
    const isModifier = btn.classList.contains("kb-modifier");
    if (isModifier) {
      btn.classList.toggle("active", isModifierActive(btn, mods));
    } else {
      btn.classList.toggle("active", key === k);
    }
  });
}

function updateRemapDisplays() {
  const fromPrefix = buildPrefix(remapFromMods, remapFromKey);
  const toPrefix = buildPrefix(remapToMods, remapToKey);
  remapFromDisplay.textContent = fromPrefix || "Click here, then pick a key";
  remapToDisplay.textContent = toPrefix || "Click here, then pick a key";
}

function clearRemapSelection() {
  remapFromMods = new Set();
  remapFromKey = null;
  remapToMods = new Set();
  remapToKey = null;
  setRemapActiveTarget("from");
  updateRemapDisplays();
}

// --- Escaping helpers (Hotkeys mode actions) ---

// Escape special characters for the Send command (AHK v1: { } ^ ! + # are special)
function escapeForSend(text) {
  return text
    .replace(/\{/g, "{{}")
    .replace(/\}/g, "{}}")
    .replace(/\^/g, "{^}")
    .replace(/!/g, "{!}")
    .replace(/\+/g, "{+}")
    .replace(/#/g, "{#}")
    .replace(/\r\n|\r|\n/g, "+{Enter}"); // newlines become Shift+Enter, which inserts a line break instead of "submitting" in chat apps like Teams or Claude
}

// Escape quotes for Run (AHK v1 uses " as a delimiter)
function escapeForRun(text) {
  return text.replace(/"/g, '""');
}

function buildActionLine(type, value) {
  switch (type) {
    case "send":
      return `    Send, ${escapeForSend(value)}`;
    case "run":
      return `    Run, "${escapeForRun(value)}"`;
    case "url":
      return `    Run, "${escapeForRun(value)}"`;
    case "command":
      return `    Run, ${value}`;
    default:
      return "";
  }
}

function buildHotkeyBlock(hotkey) {
  const lines = [];
  if (hotkey.comment) {
    lines.push(`; ${hotkey.comment}`);
  }
  lines.push(`${hotkey.prefix}::`);
  // SendMode only matters for the "send" action type (Run/Url/Command don't use Send at all).
  // It's set right before the Send line so it only affects this hotkey's execution.
  if (hotkey.actionType === "send" && hotkey.sendMode && hotkey.sendMode !== "Input") {
    lines.push(`    SendMode, ${hotkey.sendMode}`);
  }
  lines.push(buildActionLine(hotkey.actionType, hotkey.actionValue));
  lines.push("return");
  return lines.join("\n");
}

// A remap block is just "from::to" - no action line, no return.
function buildRemapBlock(remap) {
  const lines = [];
  if (remap.comment) {
    lines.push(`; ${remap.comment}`);
  }
  lines.push(`${remap.fromPrefix}::${remap.toPrefix}`);
  return lines.join("\n");
}

// A hotstring line looks like ":options:trigger::replacement" - options are optional
// and only present if at least one is enabled.
function buildHotstringLine(hotstring) {
  const lines = [];
  if (hotstring.comment) {
    lines.push(`; ${hotstring.comment}`);
  }

  let optionsStr = "";
  if (hotstring.autoReplace) optionsStr += "*";
  if (hotstring.caseSensitive) optionsStr += "C";
  if (hotstring.insideWord) optionsStr += "?";
  if (hotstring.rawText) optionsStr += "R";

  const optionsPart = optionsStr ? `:${optionsStr}:` : "::";
  lines.push(`${optionsPart}${hotstring.trigger}::${hotstring.replacement}`);
  return lines.join("\n");
}

// Signature written into every generated script's header.
// Used to verify a file was actually created by this app before attempting to parse it back.
// Prefix used to verify a file was actually created by this app, regardless of which
// app version generated it. The full header line includes the current version (e.g. "v0.5"),
// but validation only checks that it STARTS WITH this prefix, so future versions stay compatible
// with files generated by older (or newer) versions of the app.
const AHKGEN_SIGNATURE_PREFIX = "; Made with AHKgen";
const AHKGEN_VERSION = "v0.9.2";
const AHKGEN_SIGNATURE = `${AHKGEN_SIGNATURE_PREFIX} ${AHKGEN_VERSION}`;

function buildFullScript() {
  const header = [
    AHKGEN_SIGNATURE,
    "; AutoHotkey v1",
    "#NoEnv",
    "#SingleInstance, Force",
    "SendMode, Input",
    "SetWorkingDir, %A_ScriptDir%",
    "",
  ].join("\n");

  if (hotkeys.length === 0 && remaps.length === 0 && hotstrings.length === 0) {
    return header + "\n; No hotkeys, hotstrings, or remaps added yet.";
  }

  const blocks = [];
  if (hotkeys.length > 0) {
    blocks.push("; --- Hotkeys ---");
    blocks.push(hotkeys.map(buildHotkeyBlock).join("\n\n"));
  }
  if (hotstrings.length > 0) {
    blocks.push("; --- Hotstrings ---");
    blocks.push(hotstrings.map(buildHotstringLine).join("\n\n"));
  }
  if (remaps.length > 0) {
    blocks.push("; --- Key remaps ---");
    blocks.push(remaps.map(buildRemapBlock).join("\n\n"));
  }

  return header + "\n" + blocks.join("\n\n");
}

// --- Parsing an existing .ahk file back into the hotkeys/remaps lists ---

function unescapeFromSend(text) {
  return text
    .replace(/\+\{Enter\}/g, "\n") // must run before the generic {x} unescaping below
    .replace(/\{\{\}/g, "{")
    .replace(/\{\}\}/g, "}")
    .replace(/\{\^\}/g, "^")
    .replace(/\{!\}/g, "!")
    .replace(/\{\+\}/g, "+")
    .replace(/\{#\}/g, "#");
}

function unescapeFromRun(text) {
  let result = text.trim();
  if (result.startsWith('"') && result.endsWith('"')) {
    result = result.slice(1, -1);
  }
  return result.replace(/""/g, '"');
}

// Tries to classify an action line and extract its value.
// Returns { actionType, actionValue } or null if the line doesn't match any known pattern.
function parseActionLine(line) {
  const trimmed = line.trim();

  const sendMatch = trimmed.match(/^Send,\s*(.*)$/i);
  if (sendMatch) {
    return { actionType: "send", actionValue: unescapeFromSend(sendMatch[1]) };
  }

  const runMatch = trimmed.match(/^Run,\s*(.*)$/i);
  if (runMatch) {
    const raw = runMatch[1];
    const unescaped = unescapeFromRun(raw);
    const looksLikeUrl = /^https?:\/\//i.test(unescaped);
    return {
      actionType: looksLikeUrl ? "url" : "run",
      actionValue: unescaped,
    };
  }

  return null;
}

function parseAhkScript(rawText) {
  const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
  const lines = text.split(/\r\n|\r|\n/);

  const headerLines = lines.slice(0, 5);
  const hasSignature = headerLines.some((l) => l.trim().startsWith(AHKGEN_SIGNATURE_PREFIX));

  if (!hasSignature) {
    return {
      success: false,
      error:
        "This file wasn't created by AHK Generator (missing the \"Made with AHKgen\" signature), so it can't be parsed reliably. Only files generated by this app can be re-opened.",
    };
  }

  const parsedHotkeys = [];
  const parsedRemaps = [];
  const parsedHotstrings = [];
  let skippedCount = 0;

  function getPrecedingComment(index) {
    if (index <= 0) return "";
    const prevTrimmed = lines[index - 1].trim();
    if (
      prevTrimmed.startsWith(";") &&
      !prevTrimmed.startsWith(AHKGEN_SIGNATURE_PREFIX) &&
      prevTrimmed !== "; AutoHotkey v1" &&
      prevTrimmed !== "; --- Hotkeys ---" &&
      prevTrimmed !== "; --- Hotstrings ---" &&
      prevTrimmed !== "; --- Key remaps ---"
    ) {
      return prevTrimmed.slice(1).trim();
    }
    return "";
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Hotstring line: ":options:trigger::replacement" (always starts with a leading colon).
    // Checked before the remap pattern below, since both look like "x::y" but hotstrings
    // are distinguished by that leading colon.
    const hotstringMatch = trimmed.match(/^:([^:]*):([^:]+)::(.*)$/);
    // Remap line: "from::to" (no action, no return - both sides present on one line)
    const remapMatch = trimmed.match(/^(.+)::(.+)$/);
    // Hotkey line: "prefix::" (nothing after the final "::")
    const hotkeyMatch = trimmed.match(/^(.+)::$/);

    if (hotstringMatch) {
      const optionsStr = hotstringMatch[1];
      const trigger = hotstringMatch[2];
      const replacement = hotstringMatch[3];
      const comment = getPrecedingComment(i);

      parsedHotstrings.push({
        trigger,
        replacement,
        autoReplace: optionsStr.includes("*"),
        caseSensitive: optionsStr.includes("C"),
        insideWord: optionsStr.includes("?"),
        rawText: optionsStr.includes("R"),
        comment,
      });
      i += 1;
      continue;
    } else if (hotkeyMatch) {
      const prefix = hotkeyMatch[1];
      const comment = getPrecedingComment(i);

      // A hotkey block normally looks like: prefix:: / action / return
      // But if a per-hotkey SendMode override was set, there's an extra line in between:
      // prefix:: / SendMode, X / action / return
      let cursor = i + 1;
      let sendMode = "Input";
      const possibleSendModeLine = (lines[cursor] || "").trim();
      const sendModeMatch = possibleSendModeLine.match(/^SendMode,\s*(\w+)$/i);
      if (sendModeMatch) {
        sendMode = sendModeMatch[1];
        cursor += 1;
      }

      const actionLine = lines[cursor] || "";
      const returnLine = (lines[cursor + 1] || "").trim();
      const parsedAction = parseActionLine(actionLine);

      if (parsedAction && returnLine.toLowerCase() === "return") {
        parsedHotkeys.push({
          prefix,
          actionType: parsedAction.actionType,
          actionValue: parsedAction.actionValue,
          sendMode: parsedAction.actionType === "send" ? sendMode : "Input",
          comment,
        });
        i = cursor + 2;
        continue;
      } else {
        skippedCount++;
        i += 1;
        continue;
      }
    } else if (remapMatch) {
      const fromPrefix = remapMatch[1];
      const toPrefix = remapMatch[2];
      const comment = getPrecedingComment(i);

      parsedRemaps.push({ fromPrefix, toPrefix, comment });
      i += 1;
      continue;
    }

    i += 1;
  }

  return { success: true, hotkeys: parsedHotkeys, remaps: parsedRemaps, hotstrings: parsedHotstrings, skippedCount };
}

// --- Rendering: Hotkeys list ---

function renderHotkeyList() {
  hotkeyCountEl.textContent = hotkeys.length;

  if (hotkeys.length === 0) {
    hotkeyListEl.innerHTML = `<li class="empty-state">No hotkeys added yet. Use the keyboard above.</li>`;
    return;
  }

  hotkeyListEl.innerHTML = hotkeys
    .map((hk, index) => {
      const actionLabel = ACTION_CONFIG[hk.actionType].label;
      const editingClass = index === editingIndex ? " editing" : "";
      const sendModeTag =
        hk.actionType === "send" && hk.sendMode && hk.sendMode !== "Input"
          ? ` <span class="hotstring-options">[${escapeHtml(hk.sendMode)}]</span>`
          : "";
      return `
        <li class="hotkey-item${editingClass}" data-index="${index}">
          <div class="hotkey-item-main">
            <span class="hotkey-badge">${hk.prefix}</span>
            <span class="hotkey-desc">${actionLabel}: <strong>${escapeHtml(hk.actionValue)}</strong>${sendModeTag}</span>
            ${hk.comment ? `<span class="hotkey-comment">"${escapeHtml(hk.comment)}"</span>` : ""}
          </div>
          <div class="hotkey-item-actions">
            <button class="btn-edit" data-index="${index}" title="Edit">Edit</button>
            <button class="btn-remove" data-index="${index}" title="Remove">&times;</button>
          </div>
        </li>
      `;
    })
    .join("");

  hotkeyListEl.querySelectorAll(".btn-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index, 10);
      hotkeys.splice(idx, 1);
      if (editingIndex !== null) cancelEdit();
      renderAll();
    });
  });

  hotkeyListEl.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index, 10);
      startEdit(idx);
    });
  });
}

// --- Rendering: Remaps list ---

function renderRemapList() {
  remapCountEl.textContent = remaps.length;

  if (remaps.length === 0) {
    remapListEl.innerHTML = `<li class="empty-state">No remaps added yet. Use the keyboard above.</li>`;
    return;
  }

  remapListEl.innerHTML = remaps
    .map((rm, index) => {
      const editingClass = index === editingRemapIndex ? " editing" : "";
      return `
        <li class="hotkey-item${editingClass}" data-index="${index}">
          <div class="hotkey-item-main">
            <span class="hotkey-badge">${rm.fromPrefix}</span>
            <span class="remap-arrow-inline">&rarr;</span>
            <span class="hotkey-badge">${rm.toPrefix}</span>
            ${rm.comment ? `<span class="hotkey-comment">"${escapeHtml(rm.comment)}"</span>` : ""}
          </div>
          <div class="hotkey-item-actions">
            <button class="btn-edit-remap" data-index="${index}" title="Edit">Edit</button>
            <button class="btn-remove-remap" data-index="${index}" title="Remove">&times;</button>
          </div>
        </li>
      `;
    })
    .join("");

  remapListEl.querySelectorAll(".btn-remove-remap").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index, 10);
      remaps.splice(idx, 1);
      if (editingRemapIndex !== null) cancelRemapEdit();
      renderAll();
    });
  });

  remapListEl.querySelectorAll(".btn-edit-remap").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index, 10);
      startRemapEdit(idx);
    });
  });
}

// --- Rendering: Hotstrings list ---

function renderHotstringList() {
  hotstringCountEl.textContent = hotstrings.length;

  if (hotstrings.length === 0) {
    hotstringListEl.innerHTML = `<li class="empty-state">No hotstrings added yet. Fill out the form above.</li>`;
    return;
  }

  hotstringListEl.innerHTML = hotstrings
    .map((hs, index) => {
      const editingClass = index === editingHotstringIndex ? " editing" : "";
      const optionTags = [];
      if (hs.autoReplace) optionTags.push("*");
      if (hs.caseSensitive) optionTags.push("C");
      if (hs.insideWord) optionTags.push("?");
      if (hs.rawText) optionTags.push("R");
      const optionsLabel = optionTags.length > 0 ? ` <span class="hotstring-options">[${optionTags.join(" ")}]</span>` : "";

      return `
        <li class="hotkey-item${editingClass}" data-index="${index}">
          <div class="hotkey-item-main">
            <span class="hotkey-badge">${escapeHtml(hs.trigger)}</span>
            <span class="remap-arrow-inline">&rarr;</span>
            <span class="hotkey-desc"><strong>${escapeHtml(hs.replacement)}</strong>${optionsLabel}</span>
            ${hs.comment ? `<span class="hotkey-comment">"${escapeHtml(hs.comment)}"</span>` : ""}
          </div>
          <div class="hotkey-item-actions">
            <button class="btn-edit-hotstring" data-index="${index}" title="Edit">Edit</button>
            <button class="btn-remove-hotstring" data-index="${index}" title="Remove">&times;</button>
          </div>
        </li>
      `;
    })
    .join("");

  hotstringListEl.querySelectorAll(".btn-remove-hotstring").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index, 10);
      hotstrings.splice(idx, 1);
      if (editingHotstringIndex !== null) cancelHotstringEdit();
      renderAll();
    });
  });

  hotstringListEl.querySelectorAll(".btn-edit-hotstring").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index, 10);
      startHotstringEdit(idx);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderScriptPreview() {
  scriptPreviewEl.value = buildFullScript();
}

// Keeps the entry count visible on each mode tab, so switching tabs doesn't hide
// the fact that hotkeys/hotstrings/remaps already exist elsewhere.
function updateTabBadges() {
  setTabBadge(tabBadgeHotkeys, hotkeys.length);
  setTabBadge(tabBadgeHotstrings, hotstrings.length);
  setTabBadge(tabBadgeRemap, remaps.length);
}

function setTabBadge(el, count) {
  el.textContent = count;
  el.classList.toggle("hidden", count === 0);
}

function renderAll() {
  renderHotkeyList();
  renderHotstringList();
  renderRemapList();
  renderScriptPreview();
  updateTabBadges();
}

// --- Hotkeys mode: edit logic ---

function startEdit(index) {
  const hk = hotkeys[index];
  editingIndex = index;

  const { mods, key } = parsePrefix(hk.prefix);
  selectedModifiers = mods;
  selectedKey = key;
  updateKeyboardVisuals();
  updateSelectedHotkeyDisplay();

  actionType.value = hk.actionType;
  handleActionTypeChange();
  actionValue.value = hk.actionValue;
  sendModeEventToggle.checked = hk.sendMode === "Event";
  commentInput.value = hk.comment || "";

  formTitle.textContent = "Edit hotkey";
  addBtn.textContent = "Save changes";
  cancelEditBtn.classList.remove("hidden");
  clearFormError();

  renderHotkeyList();
}

function cancelEdit() {
  editingIndex = null;
  clearHotkeySelection();
  actionType.value = "send";
  handleActionTypeChange();
  actionValue.value = "";
  sendModeEventToggle.checked = false;
  commentInput.value = "";

  formTitle.textContent = "New hotkey";
  addBtn.textContent = "+ Add hotkey";
  cancelEditBtn.classList.add("hidden");
  clearFormError();

  renderHotkeyList();
}

function clearFormError() {
  formError.textContent = "";
}

function setFormError(msg) {
  formError.textContent = msg;
}

function handleAddOrSaveHotkey() {
  clearFormError();

  const prefix = buildHotkeyPrefix();
  const type = actionType.value;
  const value = actionValue.value.trim();
  const comment = commentInput.value.trim();
  const sendMode = type === "send" && sendModeEventToggle.checked ? "Event" : "Input";

  if (!selectedKey) {
    setFormError("Please select a key on the keyboard above.");
    return;
  }

  if (value.length === 0) {
    setFormError("The action field cannot be empty.");
    return;
  }

  const duplicateIndex = hotkeys.findIndex((hk) => hk.prefix === prefix);
  const isDuplicate = duplicateIndex !== -1 && duplicateIndex !== editingIndex;
  if (isDuplicate) {
    setFormError(`Hotkey "${prefix}" is already on the list.`);
    return;
  }

  const newEntry = { prefix, actionType: type, actionValue: value, sendMode, comment };

  if (editingIndex !== null) {
    hotkeys[editingIndex] = newEntry;
    cancelEdit();
  } else {
    hotkeys.push(newEntry);
    clearHotkeySelection();
    actionValue.value = "";
    sendModeEventToggle.checked = false;
    commentInput.value = "";
  }

  renderAll();
}

function handleActionTypeChange() {
  const config = ACTION_CONFIG[actionType.value];
  const isSendText = actionType.value === "send";

  // "Send text" needs a tall, multi-line textarea (for {Enter}/line breaks via Shift+Enter).
  // Every other action type is always a single short value (a path, a URL, a command),
  // so it gets a real single-line <input> instead - swapping the actual element is cleaner
  // than faking single-line behavior with CSS on a textarea.
  const currentlyTextarea = actionValue.tagName === "TEXTAREA";
  if (isSendText !== currentlyTextarea) {
    const oldValue = actionValue.value;
    const newEl = document.createElement(isSendText ? "textarea" : "input");
    newEl.id = "action-value";
    if (!isSendText) newEl.type = "text";
    if (isSendText) newEl.rows = 4;
    newEl.value = oldValue;
    actionValue.replaceWith(newEl);
    actionValue = newEl;
  }

  actionValueLabel.textContent = config.label;
  actionValue.placeholder = config.placeholder;
  actionValueHint.textContent = config.hint;
  browseFileBtn.classList.toggle("hidden", actionType.value !== "run");
  sendModeGroup.classList.toggle("hidden", !isSendText);
}

// --- Remap mode: edit logic ---

function startRemapEdit(index) {
  const rm = remaps[index];
  editingRemapIndex = index;

  const from = parsePrefix(rm.fromPrefix);
  const to = parsePrefix(rm.toPrefix);
  remapFromMods = from.mods;
  remapFromKey = from.key;
  remapToMods = to.mods;
  remapToKey = to.key;

  setRemapActiveTarget("from");
  updateRemapDisplays();

  remapCommentInput.value = rm.comment || "";

  remapFormTitle.textContent = "Edit key remap";
  addRemapBtn.textContent = "Save changes";
  cancelRemapEditBtn.classList.remove("hidden");
  clearRemapFormError();

  renderRemapList();
}

function cancelRemapEdit() {
  editingRemapIndex = null;
  clearRemapSelection();
  remapCommentInput.value = "";

  remapFormTitle.textContent = "New key remap";
  addRemapBtn.textContent = "+ Add remap";
  cancelRemapEditBtn.classList.add("hidden");
  clearRemapFormError();

  renderRemapList();
}

function clearRemapFormError() {
  remapFormError.textContent = "";
}

function setRemapFormError(msg) {
  remapFormError.textContent = msg;
}

function handleAddOrSaveRemap() {
  clearRemapFormError();

  const fromPrefix = buildPrefix(remapFromMods, remapFromKey);
  const toPrefix = buildPrefix(remapToMods, remapToKey);
  const comment = remapCommentInput.value.trim();

  if (!remapFromKey) {
    setRemapFormError('Please pick a "From" key on the keyboard above.');
    return;
  }
  if (!remapToKey) {
    setRemapFormError('Please pick a "To" key on the keyboard above.');
    return;
  }
  if (fromPrefix === toPrefix) {
    setRemapFormError('"From" and "To" keys cannot be identical.');
    return;
  }

  const duplicateIndex = remaps.findIndex((rm) => rm.fromPrefix === fromPrefix);
  const isDuplicate = duplicateIndex !== -1 && duplicateIndex !== editingRemapIndex;
  if (isDuplicate) {
    setRemapFormError(`A remap for "${fromPrefix}" already exists.`);
    return;
  }

  const newEntry = { fromPrefix, toPrefix, comment };

  if (editingRemapIndex !== null) {
    remaps[editingRemapIndex] = newEntry;
    cancelRemapEdit();
  } else {
    remaps.push(newEntry);
    clearRemapSelection();
    remapCommentInput.value = "";
  }

  renderAll();
}

// --- Hotstrings mode: edit logic ---

function startHotstringEdit(index) {
  const hs = hotstrings[index];
  editingHotstringIndex = index;

  hotstringTriggerInput.value = hs.trigger;
  hotstringReplacementInput.value = hs.replacement;
  hotstringOptAuto.checked = hs.autoReplace;
  hotstringOptCase.checked = hs.caseSensitive;
  hotstringOptInside.checked = hs.insideWord;
  hotstringOptRaw.checked = hs.rawText;
  hotstringCommentInput.value = hs.comment || "";

  hotstringFormTitle.textContent = "Edit hotstring";
  addHotstringBtn.textContent = "Save changes";
  cancelHotstringEditBtn.classList.remove("hidden");
  clearHotstringFormError();

  renderHotstringList();
}

function cancelHotstringEdit() {
  editingHotstringIndex = null;
  hotstringTriggerInput.value = "";
  hotstringReplacementInput.value = "";
  hotstringOptAuto.checked = false;
  hotstringOptCase.checked = false;
  hotstringOptInside.checked = false;
  hotstringOptRaw.checked = false;
  hotstringCommentInput.value = "";

  hotstringFormTitle.textContent = "New hotstring";
  addHotstringBtn.textContent = "+ Add hotstring";
  cancelHotstringEditBtn.classList.add("hidden");
  clearHotstringFormError();

  renderHotstringList();
}

function clearHotstringFormError() {
  hotstringFormError.textContent = "";
}

function setHotstringFormError(msg) {
  hotstringFormError.textContent = msg;
}

function handleAddOrSaveHotstring() {
  clearHotstringFormError();

  const trigger = hotstringTriggerInput.value.trim();
  const replacement = hotstringReplacementInput.value.trim();
  const autoReplace = hotstringOptAuto.checked;
  const caseSensitive = hotstringOptCase.checked;
  const insideWord = hotstringOptInside.checked;
  const rawText = hotstringOptRaw.checked;
  const comment = hotstringCommentInput.value.trim();

  if (trigger.length === 0) {
    setHotstringFormError("Please enter a trigger.");
    return;
  }
  if (/\s/.test(trigger)) {
    setHotstringFormError("The trigger cannot contain spaces.");
    return;
  }
  if (replacement.length === 0) {
    setHotstringFormError("Please enter a replacement.");
    return;
  }

  // Duplicates only matter when both the trigger AND case-sensitivity match, since
  // ":C:Btw" and ":Btw" can coexist as genuinely different hotstrings in AHK.
  const duplicateIndex = hotstrings.findIndex(
    (hs) => hs.trigger === trigger && hs.caseSensitive === caseSensitive
  );
  const isDuplicate = duplicateIndex !== -1 && duplicateIndex !== editingHotstringIndex;
  if (isDuplicate) {
    setHotstringFormError(`A hotstring for "${trigger}" already exists.`);
    return;
  }

  const newEntry = { trigger, replacement, autoReplace, caseSensitive, insideWord, rawText, comment };

  if (editingHotstringIndex !== null) {
    hotstrings[editingHotstringIndex] = newEntry;
    cancelHotstringEdit();
  } else {
    hotstrings.push(newEntry);
    hotstringTriggerInput.value = "";
    hotstringReplacementInput.value = "";
    hotstringOptAuto.checked = false;
    hotstringOptCase.checked = false;
    hotstringOptInside.checked = false;
    hotstringOptRaw.checked = false;
    hotstringCommentInput.value = "";
  }

  renderAll();
}

// --- Mode switching ---

function switchMode(mode) {
  currentMode = mode;

  modeTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  });

  modeSectionHotkeys.classList.toggle("hidden", mode !== "hotkeys");
  listSectionHotkeys.classList.toggle("hidden", mode !== "hotkeys");
  modeSectionHotstrings.classList.toggle("hidden", mode !== "hotstrings");
  listSectionHotstrings.classList.toggle("hidden", mode !== "hotstrings");
  modeSectionRemap.classList.toggle("hidden", mode !== "remap");
  listSectionRemap.classList.toggle("hidden", mode !== "remap");

  // Leaving a tab resets its form/keyboard selection (and cancels any in-progress edit there),
  // so coming back later always starts from a clean slate instead of stale state.
  if (editingIndex !== null) cancelEdit();
  if (editingRemapIndex !== null) cancelRemapEdit();
  if (editingHotstringIndex !== null) cancelHotstringEdit();
  clearHotkeySelection();
  clearRemapSelection();
}

// --- Status messages ---

let statusTimeoutId = null;

function setStatus(msg, isError = false, autoClear = true) {
  if (statusTimeoutId) {
    clearTimeout(statusTimeoutId);
    statusTimeoutId = null;
  }

  actionStatusEl.textContent = msg;
  actionStatusEl.className = isError ? "status-msg status-error" : "status-msg status-success";

  if (autoClear && !isError) {
    statusTimeoutId = setTimeout(() => {
      actionStatusEl.textContent = "";
      actionStatusEl.className = "status-msg";
      statusTimeoutId = null;
    }, 4000);
  }
}

async function handleCopy() {
  try {
    await writeText(scriptPreviewEl.value);
    setStatus("Copied to clipboard.");
  } catch (err) {
    setStatus("Error while copying: " + err, true);
  }
}

async function handleSave() {
  try {
    const filePath = await save({
      filters: [{ name: "AutoHotkey Script", extensions: ["ahk"] }],
      defaultPath: "script.ahk",
    });

    if (!filePath) return;

    const BOM = "\uFEFF";
    await writeTextFile(filePath, BOM + scriptPreviewEl.value);
    setStatus("Saved: " + filePath);
  } catch (err) {
    setStatus("Error while saving: " + err, true);
  }
}

async function handleOpenFile() {
  try {
    const filePath = await open({
      multiple: false,
      filters: [{ name: "AutoHotkey Script", extensions: ["ahk"] }],
    });

    if (!filePath) return;

    const rawText = await readTextFile(filePath);
    const result = parseAhkScript(rawText);

    if (!result.success) {
      setStatus(result.error, true);
      return;
    }

    if (result.hotkeys.length === 0 && result.remaps.length === 0 && result.hotstrings.length === 0) {
      setStatus("No recognizable hotkeys, hotstrings, or remaps were found in this file.", true);
      return;
    }

    let addedHotkeys = 0;
    let duplicateHotkeys = 0;
    for (const hk of result.hotkeys) {
      if (hotkeys.some((existing) => existing.prefix === hk.prefix)) {
        duplicateHotkeys++;
      } else {
        hotkeys.push(hk);
        addedHotkeys++;
      }
    }

    let addedHotstrings = 0;
    let duplicateHotstrings = 0;
    for (const hs of result.hotstrings) {
      if (hotstrings.some((existing) => existing.trigger === hs.trigger && existing.caseSensitive === hs.caseSensitive)) {
        duplicateHotstrings++;
      } else {
        hotstrings.push(hs);
        addedHotstrings++;
      }
    }

    let addedRemaps = 0;
    let duplicateRemaps = 0;
    for (const rm of result.remaps) {
      if (remaps.some((existing) => existing.fromPrefix === rm.fromPrefix)) {
        duplicateRemaps++;
      } else {
        remaps.push(rm);
        addedRemaps++;
      }
    }

    renderAll();

    const parts = [];
    if (addedHotkeys > 0) parts.push(`${addedHotkeys} hotkey${addedHotkeys === 1 ? "" : "s"}`);
    if (addedHotstrings > 0) parts.push(`${addedHotstrings} hotstring${addedHotstrings === 1 ? "" : "s"}`);
    if (addedRemaps > 0) parts.push(`${addedRemaps} remap${addedRemaps === 1 ? "" : "s"}`);
    let msg = parts.length > 0 ? `Loaded ${parts.join(", ")} from file.` : "No new entries loaded.";

    if (result.skippedCount > 0) {
      msg += ` ${result.skippedCount} block(s) skipped (unrecognized format).`;
    }
    const totalDuplicates = duplicateHotkeys + duplicateHotstrings + duplicateRemaps;
    if (totalDuplicates > 0) {
      msg += ` ${totalDuplicates} duplicate(s) ignored.`;
    }
    setStatus(msg, false, false);
  } catch (err) {
    setStatus("Error while opening file: " + err, true);
  }
}

async function handleBrowseFile() {
  try {
    const filePath = await open({
      multiple: false,
      // No extension filter here - the target could be any executable, document, or file.
    });

    if (!filePath) return; // user clicked "Cancel"

    actionValue.value = filePath;
  } catch (err) {
    setStatus("Error while browsing for a file: " + err, true);
  }
}

function handleKeyboardLayoutChange() {
  const layout = keyboardLayoutSelect.value;
  applyKeyboardLayout(layout);
  saveKeyboardLayoutPreference(layout);

  // Clear any in-progress key selection, since the key positions just changed underneath it
  clearHotkeySelection();
  clearRemapSelection();
}

// --- Custom title bar controls ---
// Native window decorations are disabled (decorations: false in tauri.conf.json),
// so minimize/maximize/close have to be wired up manually through the Tauri window API.

function initTitlebar() {
  const appWindow = getCurrentWindow();
  const minimizeBtn = document.querySelector("#titlebar-minimize");
  const maximizeBtn = document.querySelector("#titlebar-maximize");
  const closeBtn = document.querySelector("#titlebar-close");

  minimizeBtn.addEventListener("click", () => appWindow.minimize());
  closeBtn.addEventListener("click", () => appWindow.close());

  maximizeBtn.addEventListener("click", () => appWindow.toggleMaximize());

  // Swap the maximize icon for a "restore" icon (two overlapping squares) once the window
  // is actually maximized, and keep it in sync if the user resizes/snaps via other means
  // (e.g. Win+Up, dragging to the top edge, double-clicking the title bar).
  function setMaximizeIcon(isMaximized) {
    maximizeBtn.innerHTML = isMaximized
      ? '<svg viewBox="0 0 10 10" width="10" height="10"><rect x="2.5" y="0.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1" /><rect x="0.5" y="2.5" width="7" height="7" fill="var(--bg)" stroke="currentColor" stroke-width="1" /></svg>'
      : '<svg viewBox="0 0 10 10" width="10" height="10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1" /></svg>';
    maximizeBtn.title = isMaximized ? "Restore" : "Maximize";
    maximizeBtn.setAttribute("aria-label", maximizeBtn.title);
  }

  appWindow.isMaximized().then(setMaximizeIcon);
  appWindow.onResized(() => {
    appWindow.isMaximized().then(setMaximizeIcon);
  });

  // Double-clicking the empty drag region toggles maximize, matching native title bar behavior.
  document.querySelector(".titlebar").addEventListener("dblclick", (e) => {
    if (e.target.closest(".titlebar-btn")) return;
    appWindow.toggleMaximize();
  });
}

// --- Initialization ---

window.addEventListener("DOMContentLoaded", () => {
  modeTabs = document.querySelectorAll(".mode-tab");
  tabBadgeHotkeys = document.querySelector("#tab-badge-hotkeys");
  tabBadgeHotstrings = document.querySelector("#tab-badge-hotstrings");
  tabBadgeRemap = document.querySelector("#tab-badge-remap");
  distinguishSidesToggle = document.querySelector("#distinguish-sides-toggle");
  keyboardLayoutSelect = document.querySelector("#keyboard-layout-select");
  themeToggleCheckbox = document.querySelector("#theme-toggle-checkbox");
  sendModeEventToggle = document.querySelector("#send-mode-event-toggle");
  sendModeGroup = document.querySelector("#send-mode-group");
  modeSectionHotkeys = document.querySelector("#mode-section-hotkeys");
  modeSectionHotstrings = document.querySelector("#mode-section-hotstrings");
  modeSectionRemap = document.querySelector("#mode-section-remap");
  listSectionHotkeys = document.querySelector("#list-section-hotkeys");
  listSectionHotstrings = document.querySelector("#list-section-hotstrings");
  listSectionRemap = document.querySelector("#list-section-remap");

  keyboardEl = document.querySelector("#keyboard");
  selectedHotkeyDisplay = document.querySelector("#selected-hotkey-display");
  clearHotkeyBtn = document.querySelector("#clear-hotkey-btn");
  formTitle = document.querySelector("#form-title");

  actionType = document.querySelector("#action-type");
  actionValueGroup = document.querySelector("#action-value-group");
  actionValueLabel = document.querySelector("#action-value-label");
  actionValue = document.querySelector("#action-value");
  actionValueHint = document.querySelector("#action-value-hint");
  browseFileBtn = document.querySelector("#browse-file-btn");

  commentInput = document.querySelector("#comment-input");

  addBtn = document.querySelector("#add-hotkey-btn");
  cancelEditBtn = document.querySelector("#cancel-edit-btn");
  formError = document.querySelector("#form-error");

  hotkeyListEl = document.querySelector("#hotkey-list");
  hotkeyCountEl = document.querySelector("#hotkey-count");

  hotstringTriggerInput = document.querySelector("#hotstring-trigger-input");
  hotstringReplacementInput = document.querySelector("#hotstring-replacement-input");
  hotstringOptAuto = document.querySelector("#hotstring-opt-auto");
  hotstringOptCase = document.querySelector("#hotstring-opt-case");
  hotstringOptInside = document.querySelector("#hotstring-opt-inside");
  hotstringOptRaw = document.querySelector("#hotstring-opt-raw");
  hotstringCommentInput = document.querySelector("#hotstring-comment-input");
  addHotstringBtn = document.querySelector("#add-hotstring-btn");
  cancelHotstringEditBtn = document.querySelector("#cancel-hotstring-edit-btn");
  hotstringFormError = document.querySelector("#hotstring-form-error");
  hotstringFormTitle = document.querySelector("#hotstring-form-title");
  hotstringListEl = document.querySelector("#hotstring-list");
  hotstringCountEl = document.querySelector("#hotstring-count");

  keyboardRemapEl = document.querySelector("#keyboard-remap");
  remapTargetFromBtn = document.querySelector("#remap-target-from");
  remapTargetToBtn = document.querySelector("#remap-target-to");
  remapFromDisplay = document.querySelector("#remap-from-display");
  remapToDisplay = document.querySelector("#remap-to-display");
  remapCommentInput = document.querySelector("#remap-comment-input");
  addRemapBtn = document.querySelector("#add-remap-btn");
  cancelRemapEditBtn = document.querySelector("#cancel-remap-edit-btn");
  remapFormError = document.querySelector("#remap-form-error");
  remapFormTitle = document.querySelector("#remap-form-title");
  remapListEl = document.querySelector("#remap-list");
  remapCountEl = document.querySelector("#remap-count");

  scriptPreviewEl = document.querySelector("#script-preview");

  copyBtn = document.querySelector("#copy-btn");
  saveBtn = document.querySelector("#save-btn");
  openFileBtn = document.querySelector("#open-file-btn");
  actionStatusEl = document.querySelector("#action-status");

  // Hotkeys mode keyboard
  keyboardEl.querySelectorAll(".kb-key").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      if (btn.classList.contains("kb-modifier")) {
        toggleModifier(key);
      } else {
        selectKey(key);
      }
    });
  });
  clearHotkeyBtn.addEventListener("click", clearHotkeySelection);
  addBtn.addEventListener("click", handleAddOrSaveHotkey);
  cancelEditBtn.addEventListener("click", cancelEdit);
  actionType.addEventListener("change", handleActionTypeChange);
  browseFileBtn.addEventListener("click", handleBrowseFile);

  // Hotstrings mode
  addHotstringBtn.addEventListener("click", handleAddOrSaveHotstring);
  cancelHotstringEditBtn.addEventListener("click", cancelHotstringEdit);

  // Remap mode keyboard
  keyboardRemapEl.querySelectorAll(".kb-key").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      if (btn.classList.contains("kb-modifier")) {
        toggleRemapModifier(key);
      } else {
        selectRemapKey(key);
      }
    });
  });
  remapTargetFromBtn.addEventListener("click", () => setRemapActiveTarget("from"));
  remapTargetToBtn.addEventListener("click", () => setRemapActiveTarget("to"));
  addRemapBtn.addEventListener("click", handleAddOrSaveRemap);
  cancelRemapEditBtn.addEventListener("click", cancelRemapEdit);

  // Mode tabs
  modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchMode(tab.dataset.mode));
  });

  // Distinguish left/right keys toggle
  distinguishSidesToggle.addEventListener("change", () => {
    setDistinguishSides(distinguishSidesToggle.checked);
  });

  // Keyboard layout selector
  keyboardLayoutSelect.addEventListener("change", handleKeyboardLayoutChange);

  // Theme toggle
  themeToggleCheckbox.addEventListener("change", handleThemeToggle);

  // Shared actions
  copyBtn.addEventListener("click", handleCopy);
  saveBtn.addEventListener("click", handleSave);
  openFileBtn.addEventListener("click", handleOpenFile);

  updateModifierLabels();
  handleActionTypeChange();

  const savedLayout = loadKeyboardLayoutPreference();
  keyboardLayoutSelect.value = savedLayout;
  applyKeyboardLayout(savedLayout);

  initTheme();
  initTitlebar();

  renderAll();
});