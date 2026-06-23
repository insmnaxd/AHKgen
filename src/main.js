// --- App version ---

const AHKGEN_VERSION = "v1.0.0-alpha.1";

const { writeTextFile, readTextFile } = window.__TAURI__.fs;
const { save, open } = window.__TAURI__.dialog;
const { writeText } = window.__TAURI__.clipboardManager;
const { getCurrentWindow } = window.__TAURI__.window;
const { invoke } = window.__TAURI__.core;

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
let keyboardLayoutSelects;
let languageSelect;
let themeToggleCheckbox;
let sendModeEventToggle, sendModeGroup;
let tabBadgeHotkeys, tabBadgeHotstrings, tabBadgeRemap;
let distinguishSidesToggles;
let modeSectionHotkeys, modeSectionHotstrings, modeSectionRemap, modeSectionSettings;
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
let scriptPreviewSection;
let copyBtn, saveBtn, openFileBtn, actionStatusEl;
let resetConfigBtn, settingsStatusEl;

// --- Localization ---

const DEFAULT_LANGUAGE = "en";
const SUPPORTED_LANGUAGES = ["en", "pl", "es", "de", "fr", "it", "pt"];
const TRANSLATION_FILES = {
  en: "./i18n/en.json",
  pl: "./i18n/pl.json",
  es: "./i18n/es.json",
  de: "./i18n/de.json",
  fr: "./i18n/fr.json",
  it: "./i18n/it.json",
  pt: "./i18n/pt.json",
};
const DEFAULT_USER_CONFIG = {
  language: null,
  theme: null,
  keyboardLayout: null,
};
const LEGACY_STORAGE_KEYS = {
  language: "ahkgen.language",
  theme: "ahkgen.theme",
  keyboardLayout: "ahkgen.keyboardLayout",
};

let currentLanguage = DEFAULT_LANGUAGE;
let userConfig = { ...DEFAULT_USER_CONFIG };

const I18N = {};

// Field configuration for each action type (labels, placeholders, hints)
const ACTION_CONFIG = {
  send: {
    labelKey: "action.send.label",
    placeholderKey: "action.send.placeholder",
    hintKey: "action.send.hint",
  },
  run: {
    labelKey: "action.run.label",
    placeholderKey: "action.run.placeholder",
    hintKey: "action.run.hint",
  },
  url: {
    labelKey: "action.url.label",
    placeholderKey: "action.url.placeholder",
    hintKey: "action.url.hint",
  },
  command: {
    labelKey: "action.command.label",
    placeholderKey: "action.command.placeholder",
    hintKey: "action.command.hint",
  },
};

function getLegacyPreference(key) {
  try {
    return localStorage.getItem(LEGACY_STORAGE_KEYS[key]);
  } catch (err) {
    return null;
  }
}

function normalizeUserConfig(config) {
  return {
    language: resolveSupportedLanguage(config?.language) || null,
    theme: config?.theme === "light" || config?.theme === "dark" ? config.theme : null,
    keyboardLayout: Object.prototype.hasOwnProperty.call(LAYOUT_KEY_MAPS, config?.keyboardLayout)
      ? config.keyboardLayout
      : null,
  };
}

async function loadUserConfig() {
  try {
    const loadedConfig = await invoke("load_user_config");
    userConfig = normalizeUserConfig(loadedConfig);
    migrateLegacyPreferences();
  } catch (err) {
    console.warn("Could not load user config:", err);
    userConfig = { ...DEFAULT_USER_CONFIG };
    migrateLegacyPreferences();
  }
}

function migrateLegacyPreferences() {
  const migratedConfig = { ...userConfig };

  if (!migratedConfig.language) {
    migratedConfig.language = resolveSupportedLanguage(getLegacyPreference("language"));
  }
  if (!migratedConfig.theme) {
    const theme = getLegacyPreference("theme");
    migratedConfig.theme = theme === "light" || theme === "dark" ? theme : null;
  }
  if (!migratedConfig.keyboardLayout) {
    const keyboardLayout = getLegacyPreference("keyboardLayout");
    migratedConfig.keyboardLayout = Object.prototype.hasOwnProperty.call(LAYOUT_KEY_MAPS, keyboardLayout)
      ? keyboardLayout
      : null;
  }

  const normalizedConfig = normalizeUserConfig(migratedConfig);
  const changed = JSON.stringify(normalizedConfig) !== JSON.stringify(userConfig);
  userConfig = normalizedConfig;

  if (changed) saveUserConfig();
}

function updateUserConfig(patch) {
  userConfig = normalizeUserConfig({ ...userConfig, ...patch });
  saveUserConfig();
}

function saveUserConfig() {
  invoke("save_user_config", { config: userConfig }).catch((err) => {
    console.warn("Could not save user config:", err);
  });
}

async function loadTranslations() {
  await Promise.all(
    Object.entries(TRANSLATION_FILES).map(async ([language, filePath]) => {
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`Could not load translation file ${filePath}: ${response.status}`);
      }
      I18N[language] = await response.json();
    })
  );
}

function t(key, values = {}) {
  const template = I18N[currentLanguage]?.[key] ?? I18N[DEFAULT_LANGUAGE]?.[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}

function resolveSupportedLanguage(locale) {
  if (!locale) return null;
  const normalized = locale.toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(normalized)) return normalized;

  const base = normalized.split("-")[0];
  return SUPPORTED_LANGUAGES.includes(base) ? base : null;
}

function detectSystemLanguage() {
  const candidates = Array.isArray(navigator.languages) && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];

  for (const locale of candidates) {
    const supported = resolveSupportedLanguage(locale);
    if (supported) return supported;
  }

  return DEFAULT_LANGUAGE;
}

function getSavedLanguagePreference() {
  return resolveSupportedLanguage(userConfig.language);
}

function saveLanguagePreference(language) {
  updateUserConfig({ language });
}

function setLanguage(language, persist = false) {
  currentLanguage = resolveSupportedLanguage(language) || DEFAULT_LANGUAGE;
  if (persist) saveLanguagePreference(currentLanguage);
  applyTranslations();
}

function initLanguage() {
  setLanguage(getSavedLanguagePreference() || detectSystemLanguage());
}

function applyTranslations() {
  document.documentElement.lang = currentLanguage;
  if (languageSelect) languageSelect.value = currentLanguage;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  if (actionType) handleActionTypeChange();
  updateFormModeLabels();
  if (remapFromDisplay && remapToDisplay) updateRemapDisplays();
  updateTitlebarMaximizeLabel();
}

function updateFormModeLabels() {
  if (formTitle) {
    formTitle.textContent = t(editingIndex === null ? "form.hotkey.new" : "form.hotkey.edit");
  }
  if (addBtn) {
    addBtn.textContent = t(editingIndex === null ? "button.addHotkey" : "button.saveChanges");
  }
  if (hotstringFormTitle) {
    hotstringFormTitle.textContent = t(editingHotstringIndex === null ? "form.hotstring.new" : "form.hotstring.edit");
  }
  if (addHotstringBtn) {
    addHotstringBtn.textContent = t(editingHotstringIndex === null ? "button.addHotstring" : "button.saveChanges");
  }
  if (remapFormTitle) {
    remapFormTitle.textContent = t(editingRemapIndex === null ? "form.remap.new" : "form.remap.edit");
  }
  if (addRemapBtn) {
    addRemapBtn.textContent = t(editingRemapIndex === null ? "button.addRemap" : "button.saveChanges");
  }
}

function updateTitlebarMaximizeLabel() {
  const maximizeBtn = document.querySelector("#titlebar-maximize");
  if (!maximizeBtn || !maximizeBtn.dataset.maximized) return;

  maximizeBtn.title = maximizeBtn.dataset.maximized === "true" ? t("titlebar.restore") : t("titlebar.maximize");
  maximizeBtn.setAttribute("aria-label", maximizeBtn.title);
}

// Whether to distinguish left/right variants of Ctrl, Shift, Alt, Win (global setting)
let distinguishSides = false;

// Maps a *generic* modifier name to its AHK v1 symbol (used when distinguishSides is off)
const MODIFIER_SYMBOLS = {
  Ctrl: "^",
  Alt: "!",
  Shift: "+",
  Win: "#",
};

// Maps a side-specific key name to its AHK v1 symbol (used when distinguishSides is on).
// Ctrl/Shift/Win get left/right-aware symbols. Plain Alt intentionally stays "!" because
// AltGr has its own distinct AHK v1 symbol, <^>!, and should not collapse into Alt.
const SIDE_MODIFIER_SYMBOLS = {
  LCtrl: "<^",
  RCtrl: ">^",
  LAlt: "!",
  RAlt: "!",
  LShift: "<+",
  RShift: ">+",
  LWin: "<#",
  RWin: ">#",
  AltGr: "<^>!",
};

// Every side-specific key name maps back to its generic family, used when distinguishSides is off
// (e.g. LCtrl and RCtrl both collapse down to the generic "Ctrl" symbol). AltGr is deliberately
// its own family so it never lights up or toggles the plain Alt key.
const SIDE_KEY_TO_GENERIC = {
  LCtrl: "Ctrl",
  RCtrl: "Ctrl",
  LAlt: "Alt",
  RAlt: "Alt",
  LShift: "Shift",
  RShift: "Shift",
  LWin: "Win",
  RWin: "Win",
  AltGr: "AltGr",
};

// All recognized modifier key names (side-specific identifiers used as data-key values on buttons)
const ALL_MODIFIER_KEYS = ["LCtrl", "RCtrl", "LAlt", "RAlt", "LShift", "RShift", "LWin", "RWin", "AltGr"];

// Reverse lookup: any AHK prefix symbol sequence -> key name (longest match first).
// Generic AHK symbols map to the left-side representative so editing a saved generic
// hotkey still lights up a concrete key in the visual keyboard.
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
  ["^", "LCtrl"],
  ["!", "LAlt"],
  ["+", "LShift"],
  ["#", "LWin"],
];

// --- Shared helpers: building/parsing a "modifiers + key" prefix string ---
// `mods` is always a Set of side-specific key names (e.g. "LCtrl", "RShift", "AltGr").
// Whether the *output* symbol is side-specific or generic depends on distinguishSides.

function buildPrefix(mods, key) {
  let prefix = "";

  if (distinguishSides) {
    // Side-specific output, in a stable order: Ctrl, Alt, Shift, Win variants, then AltGr
    const appendedSymbols = new Set();
    for (const modKey of ["LCtrl", "RCtrl", "LAlt", "RAlt", "LShift", "RShift", "LWin", "RWin", "AltGr"]) {
      const symbol = SIDE_MODIFIER_SYMBOLS[modKey];
      if (mods.has(modKey) && !appendedSymbols.has(symbol)) {
        prefix += symbol;
        appendedSymbols.add(symbol);
      }
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
  updateUserConfig({ keyboardLayout: layout });
}

function loadKeyboardLayoutPreference() {
  return Object.prototype.hasOwnProperty.call(LAYOUT_KEY_MAPS, userConfig.keyboardLayout)
    ? userConfig.keyboardLayout
    : "qwerty";
}

// --- Light / dark theme ---
// Default behavior: follow the OS setting (prefers-color-scheme). If the user manually
// toggles the theme button, that explicit choice is saved and permanently overrides
// the OS setting from then on (no "auto" state to go back to, by design).

function getSavedThemePreference() {
  return userConfig.theme; // "light" | "dark" | null (never set)
}

function saveThemePreference(theme) {
  updateUserConfig({ theme });
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
  distinguishSidesToggles.forEach((toggle) => {
    toggle.checked = value;
  });

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
  remapFromDisplay.textContent = fromPrefix || t("remap.pickKey");
  remapToDisplay.textContent = toPrefix || t("remap.pickKey");
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
    const isQuoted = raw.trim().startsWith('"') && raw.trim().endsWith('"');
    if (!isQuoted) {
      return { actionType: "command", actionValue: raw.trim() };
    }

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
      error: t("error.missingSignature"),
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
    hotkeyListEl.innerHTML = `<li class="empty-state">${escapeHtml(t("empty.hotkeys"))}</li>`;
    return;
  }

  hotkeyListEl.innerHTML = hotkeys
    .map((hk, index) => {
      const actionLabel = t(ACTION_CONFIG[hk.actionType].labelKey);
      const editingClass = index === editingIndex ? " editing" : "";
      const sendModeTag =
        hk.actionType === "send" && hk.sendMode && hk.sendMode !== "Input"
          ? ` <span class="hotstring-options">[${escapeHtml(hk.sendMode)}]</span>`
          : "";
      const description = hk.comment
        ? `<span class="hotkey-desc hotkey-entry-name"><strong>${escapeHtml(hk.comment)}</strong></span>`
        : `<span class="hotkey-desc">${actionLabel}: <strong>${escapeHtml(hk.actionValue)}</strong>${sendModeTag}</span>`;
      return `
        <li class="hotkey-item hotkey-item-expandable hotkey-entry${editingClass}" data-index="${index}" tabindex="0">
          <div class="hotkey-item-main">
            <span class="entry-prefix">
              <span class="hotkey-badge">${escapeHtml(hk.prefix)}</span>
            </span>
            ${description}
          </div>
          <div class="hotkey-item-actions">
            <button class="btn-remove" data-index="${index}" title="${escapeHtml(t("button.remove"))}">&times;</button>
          </div>
        </li>
      `;
    })
    .join("");

  setupEditableEntries(hotkeyListEl, (index) => {
    if (editingIndex === index) {
      cancelEdit();
    } else {
      startEdit(index);
    }
  });

  hotkeyListEl.querySelectorAll(".btn-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index, 10);
      const removingLastEntry = hotkeys.length === 1;
      animateEntryRemoval(btn.closest(".hotkey-item"), () => {
        hotkeys.splice(idx, 1);
        if (editingIndex !== null) cancelEdit();
        renderAll();
        if (removingLastEntry) animateEmptyState(hotkeyListEl);
      }, removingLastEntry);
    });
  });

}

// --- Rendering: Remaps list ---

function renderRemapList() {
  remapCountEl.textContent = remaps.length;

  if (remaps.length === 0) {
    remapListEl.innerHTML = `<li class="empty-state">${escapeHtml(t("empty.remaps"))}</li>`;
    return;
  }

  remapListEl.innerHTML = remaps
    .map((rm, index) => {
      const editingClass = index === editingRemapIndex ? " editing" : "";
      const entryName = rm.comment
        ? `<span class="hotkey-desc hotkey-entry-name"><strong>${escapeHtml(rm.comment)}</strong></span>`
        : "";
      return `
        <li class="hotkey-item hotkey-item-expandable remap-entry${editingClass}" data-index="${index}" tabindex="0">
          <div class="hotkey-item-main">
            <span class="entry-prefix">
              <span class="hotkey-badge">${escapeHtml(rm.fromPrefix)}</span>
              <span class="remap-arrow-inline">&rarr;</span>
              <span class="hotkey-badge">${escapeHtml(rm.toPrefix)}</span>
            </span>
            ${entryName}
          </div>
          <div class="hotkey-item-actions">
            <button class="btn-remove-remap" data-index="${index}" title="${escapeHtml(t("button.remove"))}">&times;</button>
          </div>
        </li>
      `;
    })
    .join("");

  setupEditableEntries(remapListEl, (index) => {
    if (editingRemapIndex === index) {
      cancelRemapEdit();
    } else {
      startRemapEdit(index);
    }
  });

  remapListEl.querySelectorAll(".btn-remove-remap").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index, 10);
      const removingLastEntry = remaps.length === 1;
      animateEntryRemoval(btn.closest(".hotkey-item"), () => {
        remaps.splice(idx, 1);
        if (editingRemapIndex !== null) cancelRemapEdit();
        renderAll();
        if (removingLastEntry) animateEmptyState(remapListEl);
      }, removingLastEntry);
    });
  });

}

// --- Rendering: Hotstrings list ---

function renderHotstringList() {
  hotstringCountEl.textContent = hotstrings.length;

  if (hotstrings.length === 0) {
    hotstringListEl.innerHTML = `<li class="empty-state">${escapeHtml(t("empty.hotstrings"))}</li>`;
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
      const description = hs.comment
        ? `<span class="hotkey-desc hotkey-entry-name"><strong>${escapeHtml(hs.comment)}</strong></span>`
        : `
            <span class="hotkey-desc"><strong>${escapeHtml(hs.replacement)}</strong>${optionsLabel}</span>
          `;

      return `
        <li class="hotkey-item hotkey-item-expandable hotstring-entry${editingClass}" data-index="${index}" tabindex="0">
          <div class="hotkey-item-main">
            <span class="entry-prefix">
              <span class="hotkey-badge">${escapeHtml(hs.trigger)}</span>
              ${hs.comment ? "" : '<span class="remap-arrow-inline">&rarr;</span>'}
            </span>
            ${description}
          </div>
          <div class="hotkey-item-actions">
            <button class="btn-remove-hotstring" data-index="${index}" title="${escapeHtml(t("button.remove"))}">&times;</button>
          </div>
        </li>
      `;
    })
    .join("");

  setupEditableEntries(hotstringListEl, (index) => {
    if (editingHotstringIndex === index) {
      cancelHotstringEdit();
    } else {
      startHotstringEdit(index);
    }
  });

  hotstringListEl.querySelectorAll(".btn-remove-hotstring").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index, 10);
      const removingLastEntry = hotstrings.length === 1;
      animateEntryRemoval(btn.closest(".hotkey-item"), () => {
        hotstrings.splice(idx, 1);
        if (editingHotstringIndex !== null) cancelHotstringEdit();
        renderAll();
        if (removingLastEntry) animateEmptyState(hotstringListEl);
      }, removingLastEntry);
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

  formTitle.textContent = t("form.hotkey.edit");
  addBtn.textContent = t("button.saveChanges");
  cancelEditBtn.classList.remove("hidden");
  clearFormError();

  setEditingEntry(hotkeyListEl, index);
}

function cancelEdit() {
  const cancelledIndex = editingIndex;
  editingIndex = null;
  clearHotkeySelection();
  actionType.value = "send";
  handleActionTypeChange();
  actionValue.value = "";
  sendModeEventToggle.checked = false;
  commentInput.value = "";

  formTitle.textContent = t("form.hotkey.new");
  addBtn.textContent = t("button.addHotkey");
  cancelEditBtn.classList.add("hidden");
  clearFormError();

  clearEditingEntry(hotkeyListEl, cancelledIndex);
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
    setFormError(t("error.noHotkeyKey"));
    return;
  }

  if (value.length === 0) {
    setFormError(t("error.emptyAction"));
    return;
  }

  const duplicateIndex = hotkeys.findIndex((hk) => hk.prefix === prefix);
  const isDuplicate = duplicateIndex !== -1 && duplicateIndex !== editingIndex;
  if (isDuplicate) {
    setFormError(t("error.duplicateHotkey", { prefix }));
    return;
  }

  const newEntry = { prefix, actionType: type, actionValue: value, sendMode, comment };

  let addedIndex = null;
  if (editingIndex !== null) {
    hotkeys[editingIndex] = newEntry;
    cancelEdit();
  } else {
    hotkeys.push(newEntry);
    addedIndex = hotkeys.length - 1;
    clearHotkeySelection();
    actionValue.value = "";
    sendModeEventToggle.checked = false;
    commentInput.value = "";
  }

  renderAll();
  if (addedIndex !== null) animateEntryAddition(hotkeyListEl, addedIndex, addedIndex === 0);
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

  actionValueLabel.textContent = t(config.labelKey);
  actionValue.placeholder = t(config.placeholderKey);
  actionValueHint.textContent = t(config.hintKey);
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

  remapFormTitle.textContent = t("form.remap.edit");
  addRemapBtn.textContent = t("button.saveChanges");
  cancelRemapEditBtn.classList.remove("hidden");
  clearRemapFormError();

  setEditingEntry(remapListEl, index);
}

function cancelRemapEdit() {
  const cancelledIndex = editingRemapIndex;
  editingRemapIndex = null;
  clearRemapSelection();
  remapCommentInput.value = "";

  remapFormTitle.textContent = t("form.remap.new");
  addRemapBtn.textContent = t("button.addRemap");
  cancelRemapEditBtn.classList.add("hidden");
  clearRemapFormError();

  clearEditingEntry(remapListEl, cancelledIndex);
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
    setRemapFormError(t("error.remapMissingFrom"));
    return;
  }
  if (!remapToKey) {
    setRemapFormError(t("error.remapMissingTo"));
    return;
  }
  if (fromPrefix === toPrefix) {
    setRemapFormError(t("error.remapSame"));
    return;
  }

  const duplicateIndex = remaps.findIndex((rm) => rm.fromPrefix === fromPrefix);
  const isDuplicate = duplicateIndex !== -1 && duplicateIndex !== editingRemapIndex;
  if (isDuplicate) {
    setRemapFormError(t("error.duplicateRemap", { prefix: fromPrefix }));
    return;
  }

  const newEntry = { fromPrefix, toPrefix, comment };

  let addedIndex = null;
  if (editingRemapIndex !== null) {
    remaps[editingRemapIndex] = newEntry;
    cancelRemapEdit();
  } else {
    remaps.push(newEntry);
    addedIndex = remaps.length - 1;
    clearRemapSelection();
    remapCommentInput.value = "";
  }

  renderAll();
  if (addedIndex !== null) animateEntryAddition(remapListEl, addedIndex, addedIndex === 0);
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

  hotstringFormTitle.textContent = t("form.hotstring.edit");
  addHotstringBtn.textContent = t("button.saveChanges");
  cancelHotstringEditBtn.classList.remove("hidden");
  clearHotstringFormError();

  setEditingEntry(hotstringListEl, index);
}

function cancelHotstringEdit() {
  const cancelledIndex = editingHotstringIndex;
  editingHotstringIndex = null;
  hotstringTriggerInput.value = "";
  hotstringReplacementInput.value = "";
  hotstringOptAuto.checked = false;
  hotstringOptCase.checked = false;
  hotstringOptInside.checked = false;
  hotstringOptRaw.checked = false;
  hotstringCommentInput.value = "";

  hotstringFormTitle.textContent = t("form.hotstring.new");
  addHotstringBtn.textContent = t("button.addHotstring");
  cancelHotstringEditBtn.classList.add("hidden");
  clearHotstringFormError();

  clearEditingEntry(hotstringListEl, cancelledIndex);
}

function setupEditableEntries(listEl, handleEdit) {
  listEl.querySelectorAll(".hotkey-item-expandable").forEach((item) => {
    const description = item.querySelector(".hotkey-desc");

    if (description && item.classList.contains("editing")) {
      expandEntry(item, false);
    }

    item.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      handleEdit(parseInt(item.dataset.index, 10));
    });

    item.addEventListener("keydown", (event) => {
      if (event.target !== item || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      handleEdit(parseInt(item.dataset.index, 10));
    });

    item.addEventListener("mouseenter", () => {
      if (description) expandEntry(item);
    });
    item.addEventListener("mouseleave", () => {
      if (description && !item.classList.contains("editing")) collapseEntry(item);
    });
  });
}

function setEditingEntry(listEl, index) {
  listEl.querySelectorAll(".hotkey-item-expandable").forEach((item) => {
    const isEdited = parseInt(item.dataset.index, 10) === index;
    item.classList.toggle("editing", isEdited);

    if (isEdited && !item.classList.contains("expanded")) {
      expandEntry(item);
    } else if (!isEdited && item.classList.contains("expanded") && !item.matches(":hover")) {
      collapseEntry(item);
    }
  });
}

function clearEditingEntry(listEl, index) {
  if (index === null) return;
  const item = listEl.querySelector(`[data-index="${index}"]`);
  if (!item) return;

  item.classList.remove("editing");
  collapseEntry(item);
}

function animateEntryAddition(listEl, index, replacedEmptyState = false) {
  const item = listEl.querySelector(`[data-index="${index}"]`);
  if (!item || !item.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  listEl.classList.add("animating-entry");
  const height = item.getBoundingClientRect().height;
  const startFrame = replacedEmptyState
    ? {
        height: `${height}px`,
        marginBottom: "8px",
        paddingTop: "10px",
        paddingBottom: "10px",
        opacity: 0,
        transform: "translateY(6px)",
      }
    : {
        height: "0px",
        marginBottom: "0px",
        paddingTop: "0px",
        paddingBottom: "0px",
        opacity: 0,
        transform: "translateY(-8px)",
      };
  const animation = item.animate(
    [
      startFrame,
      {
        height: `${height}px`,
        marginBottom: "8px",
        paddingTop: "10px",
        paddingBottom: "10px",
        opacity: 1,
        transform: "translateY(0)",
      },
    ],
    {
      duration: 320,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    }
  );

  animation.finished
    .catch(() => {})
    .finally(() => listEl.classList.remove("animating-entry"));
}

function animateEntryRemoval(item, removeEntry, revealsEmptyState = false) {
  if (!item) {
    removeEntry();
    return;
  }

  if (!item.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    removeEntry();
    return;
  }

  item.style.pointerEvents = "none";
  item.style.overflow = "hidden";
  const height = item.getBoundingClientRect().height;
  const endFrame = revealsEmptyState
    ? {
        height: `${height}px`,
        marginBottom: "8px",
        paddingTop: "10px",
        paddingBottom: "10px",
        opacity: 0,
        transform: "translateY(-6px)",
      }
    : {
        height: "0px",
        marginBottom: "0px",
        paddingTop: "0px",
        paddingBottom: "0px",
        opacity: 0,
        transform: "translateY(-6px)",
      };
  const animation = item.animate(
    [
      {
        height: `${height}px`,
        marginBottom: "8px",
        paddingTop: "10px",
        paddingBottom: "10px",
        opacity: 1,
        transform: "translateY(0)",
      },
      endFrame,
    ],
    {
      duration: 280,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards",
    }
  );

  animation.finished.then(removeEntry).catch(removeEntry);
}

function animateEmptyState(listEl) {
  const emptyState = listEl.querySelector(".empty-state");
  if (!emptyState || !emptyState.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  emptyState.animate(
    [
      { opacity: 0, transform: "translateY(5px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    {
      duration: 220,
      easing: "ease-out",
    }
  );
}

function expandEntry(item, animate = true) {
  const description = item.querySelector(".hotkey-desc");
  if (!description) return;

  item.classList.remove("collapsing");
  description.classList.add("measuring");
  const expandedHeight = description.scrollHeight;
  description.classList.remove("measuring");
  description.style.maxHeight = animate ? `${description.offsetHeight}px` : `${expandedHeight}px`;
  item.classList.add("expanded");

  if (animate) {
    requestAnimationFrame(() => {
      description.style.maxHeight = `${expandedHeight}px`;
    });
  }
}

function collapseEntry(item) {
  const description = item.querySelector(".hotkey-desc");
  if (!description) return;

  description.style.maxHeight = `${description.scrollHeight}px`;
  item.classList.remove("expanded");
  item.classList.add("collapsing");

  description.addEventListener("transitionend", (event) => {
    if (event.propertyName !== "max-height" || item.classList.contains("expanded")) return;
    item.classList.remove("collapsing");
    description.style.maxHeight = "26px";
  }, { once: true });

  requestAnimationFrame(() => {
    description.style.maxHeight = "26px";
  });
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
    setHotstringFormError(t("error.hotstringMissingTrigger"));
    return;
  }
  if (/\s/.test(trigger)) {
    setHotstringFormError(t("error.hotstringTriggerSpaces"));
    return;
  }
  if (trigger.includes(":")) {
    setHotstringFormError(t("error.hotstringTriggerColon"));
    return;
  }
  if (replacement.length === 0) {
    setHotstringFormError(t("error.hotstringMissingReplacement"));
    return;
  }

  // Duplicates only matter when both the trigger AND case-sensitivity match, since
  // ":C:Btw" and ":Btw" can coexist as genuinely different hotstrings in AHK.
  const duplicateIndex = hotstrings.findIndex(
    (hs) => hs.trigger === trigger && hs.caseSensitive === caseSensitive
  );
  const isDuplicate = duplicateIndex !== -1 && duplicateIndex !== editingHotstringIndex;
  if (isDuplicate) {
    setHotstringFormError(t("error.duplicateHotstring", { trigger }));
    return;
  }

  const newEntry = { trigger, replacement, autoReplace, caseSensitive, insideWord, rawText, comment };

  let addedIndex = null;
  if (editingHotstringIndex !== null) {
    hotstrings[editingHotstringIndex] = newEntry;
    cancelHotstringEdit();
  } else {
    hotstrings.push(newEntry);
    addedIndex = hotstrings.length - 1;
    hotstringTriggerInput.value = "";
    hotstringReplacementInput.value = "";
    hotstringOptAuto.checked = false;
    hotstringOptCase.checked = false;
    hotstringOptInside.checked = false;
    hotstringOptRaw.checked = false;
    hotstringCommentInput.value = "";
  }

  renderAll();
  if (addedIndex !== null) animateEntryAddition(hotstringListEl, addedIndex, addedIndex === 0);
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
  modeSectionSettings.classList.toggle("hidden", mode !== "settings");
  scriptPreviewSection.classList.toggle("hidden", mode === "settings");

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
    setStatus(t("status.copied"));
  } catch (err) {
    setStatus(t("status.copyError", { error: err }), true);
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
    setStatus(t("status.saved", { path: filePath }));
  } catch (err) {
    setStatus(t("status.saveError", { error: err }), true);
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
      setStatus(t("status.noRecognizableEntries"), true);
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
    if (addedHotkeys > 0) parts.push(t("count.hotkeys", { count: addedHotkeys }));
    if (addedHotstrings > 0) parts.push(t("count.hotstrings", { count: addedHotstrings }));
    if (addedRemaps > 0) parts.push(t("count.remaps", { count: addedRemaps }));
    let msg = parts.length > 0 ? t("status.loaded", { parts: parts.join(", ") }) : t("status.noNewEntries");

    if (result.skippedCount > 0) {
      msg += t("status.skipped", { count: result.skippedCount });
    }
    const totalDuplicates = duplicateHotkeys + duplicateHotstrings + duplicateRemaps;
    if (totalDuplicates > 0) {
      msg += t("status.duplicates", { count: totalDuplicates });
    }
    setStatus(msg, false, false);
  } catch (err) {
    setStatus(t("status.openError", { error: err }), true);
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
    setStatus(t("status.browseError", { error: err }), true);
  }
}

function handleKeyboardLayoutChange(event) {
  const layout = event.currentTarget.value;
  keyboardLayoutSelects.forEach((select) => {
    select.value = layout;
  });
  applyKeyboardLayout(layout);
  saveKeyboardLayoutPreference(layout);

  // Clear any in-progress key selection, since the key positions just changed underneath it
  clearHotkeySelection();
  clearRemapSelection();
}

function handleLanguageChange() {
  setLanguage(languageSelect.value, true);
  renderAll();
}

async function handleResetConfig() {
  if (!window.confirm(t("settings.resetConfirmation"))) return;

  resetConfigBtn.disabled = true;
  settingsStatusEl.textContent = t("status.resettingConfig");
  settingsStatusEl.className = "status-msg";

  try {
    Object.values(LEGACY_STORAGE_KEYS).forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (err) {
        console.warn(`Could not remove legacy preference ${key}:`, err);
      }
    });
    await invoke("reset_user_config");
  } catch (err) {
    resetConfigBtn.disabled = false;
    settingsStatusEl.textContent = t("status.resetConfigError", { error: err });
    settingsStatusEl.className = "status-msg status-error";
  }
}

// --- Version display ---
// Pulls AHKGEN_VERSION (declared at the very top of this file) into the
// .version-tag span in the header, so the HTML never has to hardcode it.

function injectVersion() {
  const versionTagEl = document.querySelector(".version-tag");
  if (versionTagEl) versionTagEl.textContent = AHKGEN_VERSION;
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
    maximizeBtn.dataset.maximized = isMaximized ? "true" : "false";
    updateTitlebarMaximizeLabel();
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

window.addEventListener("DOMContentLoaded", async () => {
  injectVersion();

  modeTabs = document.querySelectorAll(".mode-tab");
  tabBadgeHotkeys = document.querySelector("#tab-badge-hotkeys");
  tabBadgeHotstrings = document.querySelector("#tab-badge-hotstrings");
  tabBadgeRemap = document.querySelector("#tab-badge-remap");
  distinguishSidesToggles = document.querySelectorAll(".distinguish-sides-toggle");
  keyboardLayoutSelects = document.querySelectorAll(".keyboard-layout-select");
  languageSelect = document.querySelector("#language-select");
  themeToggleCheckbox = document.querySelector("#theme-toggle-checkbox");
  sendModeEventToggle = document.querySelector("#send-mode-event-toggle");
  sendModeGroup = document.querySelector("#send-mode-group");
  modeSectionHotkeys = document.querySelector("#mode-section-hotkeys");
  modeSectionHotstrings = document.querySelector("#mode-section-hotstrings");
  modeSectionRemap = document.querySelector("#mode-section-remap");
  modeSectionSettings = document.querySelector("#mode-section-settings");
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
  scriptPreviewSection = document.querySelector("#script-preview-section");

  copyBtn = document.querySelector("#copy-btn");
  saveBtn = document.querySelector("#save-btn");
  openFileBtn = document.querySelector("#open-file-btn");
  actionStatusEl = document.querySelector("#action-status");
  resetConfigBtn = document.querySelector("#reset-config-btn");
  settingsStatusEl = document.querySelector("#settings-status");

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
  distinguishSidesToggles.forEach((toggle) => {
    toggle.addEventListener("change", () => {
      setDistinguishSides(toggle.checked);
    });
  });

  // Keyboard layout selector
  keyboardLayoutSelects.forEach((select) => {
    select.addEventListener("change", handleKeyboardLayoutChange);
  });

  // Language selector
  languageSelect.addEventListener("change", handleLanguageChange);
  resetConfigBtn.addEventListener("click", handleResetConfig);

  // Theme toggle
  themeToggleCheckbox.addEventListener("change", handleThemeToggle);

  // Shared actions
  copyBtn.addEventListener("click", handleCopy);
  saveBtn.addEventListener("click", handleSave);
  openFileBtn.addEventListener("click", handleOpenFile);

  try {
    await loadTranslations();
  } catch (err) {
    console.warn("Could not load translations:", err);
  }

  await loadUserConfig();

  const savedLayout = loadKeyboardLayoutPreference();
  keyboardLayoutSelects.forEach((select) => {
    select.value = savedLayout;
  });
  applyKeyboardLayout(savedLayout);

  initLanguage();
  updateModifierLabels();

  initTheme();
  initTitlebar();

  renderAll();
});
