import { buildFullScript } from "./ahk/generator.js";
import { parseAhkScript } from "./ahk/parser.js";
import { createUserConfigStore } from "./config/user-config.js";
import { getKeyboardLayoutMap, isSupportedKeyboardLayout } from "./keyboard/layouts.js";
import {
  buildPrefix,
  isModifierActive,
  parsePrefix,
  toggleModifierInSet,
} from "./keyboard/prefixes.js";

// --- App version ---

const AHKGEN_VERSION = "v1.0.0-alpha.2";

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
let currentLanguage = DEFAULT_LANGUAGE;

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

const userConfigStore = createUserConfigStore({
  invoke,
  storage: localStorage,
  resolveLanguage: resolveSupportedLanguage,
  isKeyboardLayout: isSupportedKeyboardLayout,
});

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
  return resolveSupportedLanguage(userConfigStore.get().language);
}

function saveLanguagePreference(language) {
  userConfigStore.update({ language });
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

// Updates the visible label of every modifier button on both keyboards,
// switching between e.g. "Ctrl" and "L Ctrl" / "R Ctrl" depending on distinguishSides.
// --- Keyboard layout (QWERTY / QWERTZ / AZERTY) ---
// All button data-key attributes in the HTML are written in QWERTY (the base layout).
// Switching layouts remaps specific QWERTY letter keys to their physical equivalent
// in the chosen layout, both for the visible label and the underlying data-key used
// to build AHK prefixes - so the hotkey generated matches the physical key the user
// would actually press on that layout.
function applyKeyboardLayout(layout) {
  const map = getKeyboardLayoutMap(layout);

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
  userConfigStore.update({ keyboardLayout: layout });
}

function loadKeyboardLayoutPreference() {
  const { keyboardLayout } = userConfigStore.get();
  return isSupportedKeyboardLayout(keyboardLayout) ? keyboardLayout : "qwerty";
}

// --- Light / dark theme ---
// Default behavior: follow the OS setting (prefers-color-scheme). If the user manually
// toggles the theme button, that explicit choice is saved and permanently overrides
// the OS setting from then on (no "auto" state to go back to, by design).

function getSavedThemePreference() {
  return userConfigStore.get().theme; // "light" | "dark" | null (never set)
}

function saveThemePreference(theme) {
  userConfigStore.update({ theme });
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

function toggleModifier(modKey) {
  toggleModifierInSet(selectedModifiers, modKey, distinguishSides);
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

function updateKeyboardVisuals() {
  const buttons = keyboardEl.querySelectorAll(".kb-key");
  buttons.forEach((btn) => {
    const key = btn.dataset.key;
    const isModifier = btn.classList.contains("kb-modifier");
    if (isModifier) {
      btn.classList.toggle(
        "active",
        isModifierActive(key, btn.dataset.base, selectedModifiers, distinguishSides)
      );
    } else {
      btn.classList.toggle("active", selectedKey === key);
    }
  });
}

function buildHotkeyPrefix() {
  return buildPrefix(selectedModifiers, selectedKey, distinguishSides);
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
  toggleModifierInSet(mods, modKey, distinguishSides);
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
      btn.classList.toggle(
        "active",
        isModifierActive(k, btn.dataset.base, mods, distinguishSides)
      );
    } else {
      btn.classList.toggle("active", key === k);
    }
  });
}

function updateRemapDisplays() {
  const fromPrefix = buildPrefix(remapFromMods, remapFromKey, distinguishSides);
  const toPrefix = buildPrefix(remapToMods, remapToKey, distinguishSides);
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

// AHK generation and parsing live in pure modules under src/ahk.

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
  scriptPreviewEl.value = buildFullScript({
    version: AHKGEN_VERSION,
    hotkeys,
    remaps,
    hotstrings,
  });
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

  const fromPrefix = buildPrefix(remapFromMods, remapFromKey, distinguishSides);
  const toPrefix = buildPrefix(remapToMods, remapToKey, distinguishSides);
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
      setStatus(t(result.errorKey), true);
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
    userConfigStore.clearLegacyPreferences();
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

  await userConfigStore.load();

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
