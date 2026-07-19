import { createUserConfigStore } from "./config/user-config.js";
import { createHotkeysController } from "./hotkeys/controller.js";
import { createHotstringsController } from "./hotstrings/controller.js";
import { createI18n, resolveSupportedLanguage } from "./i18n/index.js";
import { createInputCapture } from "./input/capture.js";
import {
  getKeyboardLayoutMap,
  isSupportedKeyboardLayout,
} from "./keyboard/layouts.js";
import { createRemapsController } from "./remaps/controller.js";
import { createEntryListUi } from "./ui/entry-list.js";
import { createAhkVersionController } from "./ui/ahk-version.js";
import { escapeHtml } from "./ui/html.js";
import { createKeyboardLayoutPickers } from "./ui/keyboard-layout-picker.js";
import { createLanguagePicker } from "./ui/language-picker.js";
import { createModesController } from "./ui/modes.js";
import { createMouseOnlyInteraction } from "./ui/mouse-only-interaction.js";
import { createScriptWorkspace } from "./ui/script-workspace.js";
import { setAnimatedMessage } from "./ui/status-message.js";
import { createThemeController } from "./ui/theme.js";
import { createTitlebarController, injectVersion } from "./ui/titlebar.js";
import { renderVisualInputPicker } from "./ui/visual-input.js";

const AHKFORGE_VERSION = "v1.0.0-rc.0";

const {
  fs,
  dialog,
  clipboardManager,
  opener,
  window: tauriWindow,
  event: tauriEvent,
  core,
} =
  window.__TAURI__;
const entries = {
  hotkeys: [],
  hotstrings: [],
  remaps: [],
};

const i18n = createI18n();
const t = (key, values = {}) => i18n.t(key, values);
const userConfigStore = createUserConfigStore({
  invoke: core.invoke,
  resolveLanguage: resolveSupportedLanguage,
  isKeyboardLayout: isSupportedKeyboardLayout,
});

let distinguishSides = false;
let hotkeysController;
let hotstringsController;
let remapsController;
let titlebarController;
let scriptWorkspace;
let ahkVersionController;
let languagePickerController;

function applyTranslations(languageSelect) {
  i18n.applyToDocument(document);
  languageSelect.value = i18n.getLanguage();
  languagePickerController?.sync();
  hotkeysController.updateTranslations();
  hotstringsController.updateLabels();
  remapsController.updateLabels();
  remapsController.updateDisplays();
  titlebarController.updateMaximizeLabel();
}

function setLanguage(language, languageSelect, persist = false) {
  const currentLanguage = i18n.setLanguage(language);
  if (persist) userConfigStore.update({ language: currentLanguage });
  applyTranslations(languageSelect);
}

function applyKeyboardLayout(layout) {
  const map = getKeyboardLayoutMap(layout);
  hotkeysController.applyKeyboardLayout(map);
  remapsController.applyKeyboardLayout(map);
}

function setDistinguishSides(value, toggles) {
  distinguishSides = value;
  toggles.forEach((toggle) => {
    toggle.checked = value;
  });
  hotkeysController.clearModifiers();
  remapsController.clearModifiers();
  hotkeysController.updateModifierLabels();
  remapsController.updateModifierLabels();
}

function updateTabBadges(badges) {
  for (const [type, badge] of Object.entries(badges)) {
    const count = entries[type].length;
    badge.textContent = count;
    badge.classList.toggle("hidden", count === 0);
  }
}

function resetEditors() {
  if (hotkeysController.isEditing()) hotkeysController.cancelEdit();
  if (hotstringsController.isEditing()) hotstringsController.cancelEdit();
  if (remapsController.isEditing()) remapsController.cancelEdit();
  hotkeysController.clearSelection();
  remapsController.clearSelection();
}

window.addEventListener("DOMContentLoaded", async () => {
  injectVersion(document, AHKFORGE_VERSION);
  renderVisualInputPicker(document.querySelector("#keyboard"));
  renderVisualInputPicker(document.querySelector("#keyboard-remap"));

  const keyboardLayoutSelects = document.querySelectorAll(
    ".keyboard-layout-select"
  );
  const keyboardLayoutPickerController = createKeyboardLayoutPickers({
    documentLike: document,
  });
  const distinguishSidesToggles = document.querySelectorAll(
    ".distinguish-sides-toggle"
  );
  const languageSelect = document.querySelector("#language-select");
  languagePickerController = createLanguagePicker({
    documentLike: document,
    select: languageSelect,
  });
  const resetConfigButton = document.querySelector("#reset-config-btn");
  const settingsStatus = document.querySelector("#settings-status");
  const repositoryLink = document.querySelector("#about-repository-link");
  const badges = {
    hotkeys: document.querySelector("#tab-badge-hotkeys"),
    hotstrings: document.querySelector("#tab-badge-hotstrings"),
    remaps: document.querySelector("#tab-badge-remap"),
  };

  const entryListUi = createEntryListUi({ windowLike: window });
  const inputCapture = createInputCapture({
    documentLike: document,
    setNativeCaptureEnabled: (enabled) => {
      return core
        .invoke("set_windows_key_capture", { enabled })
        .catch((error) => {
          console.warn("Could not toggle native Windows-key capture:", error);
        });
    },
  });
  await tauriEvent.listen("native-key", ({ payload }) => {
    inputCapture.handleNativeKey(payload);
  });
  const mouseOnlyInteraction = createMouseOnlyInteraction({
    documentLike: document,
    MutationObserverClass: window.MutationObserver,
  });
  const refreshOutput = () => {
    scriptWorkspace.render();
    updateTabBadges(badges);
  };
  const renderAll = () => {
    hotkeysController.render();
    hotstringsController.render();
    remapsController.render();
    refreshOutput();
  };

  ahkVersionController = createAhkVersionController({
    toggle: document.querySelector("#ahk-version-toggle"),
    getSavedVersion: () => userConfigStore.get().ahkVersion,
    saveVersion: (ahkVersion) => userConfigStore.update({ ahkVersion }),
    onChange: () => scriptWorkspace.render(),
  });

  scriptWorkspace = createScriptWorkspace({
    documentLike: document,
    version: AHKFORGE_VERSION,
    entries,
    t,
    clipboard: clipboardManager,
    fileSystem: fs,
    dialogs: dialog,
    onEntriesChanged: renderAll,
    getAhkVersion: () => ahkVersionController.getVersion(),
    onAhkVersionDetected: (ahkVersion) =>
      ahkVersionController.apply(ahkVersion, { persist: true }),
  });
  hotkeysController = createHotkeysController({
    documentLike: document,
    entries: entries.hotkeys,
    t,
    escapeHtml,
    getDistinguishSides: () => distinguishSides,
    inputCapture,
    ...entryListUi,
    browseForFile: () => dialog.open({ multiple: false }),
    onBrowseError: (error) => {
      scriptWorkspace.setStatus(t("status.browseError", { error }), true);
    },
    onChange: () => {
      hotkeysController.render();
      refreshOutput();
    },
  });
  hotstringsController = createHotstringsController({
    documentLike: document,
    entries: entries.hotstrings,
    t,
    escapeHtml,
    ...entryListUi,
    onChange: () => {
      hotstringsController.render();
      refreshOutput();
    },
  });
  remapsController = createRemapsController({
    documentLike: document,
    entries: entries.remaps,
    t,
    escapeHtml,
    getDistinguishSides: () => distinguishSides,
    inputCapture,
    ...entryListUi,
    onChange: () => {
      remapsController.render();
      refreshOutput();
    },
  });

  const modesController = createModesController({
    documentLike: document,
    onSwitch: resetEditors,
  });
  const themeController = createThemeController({
    documentLike: document,
    windowLike: window,
    toggle: document.querySelector("#theme-toggle-checkbox"),
    getSavedTheme: () => userConfigStore.get().theme,
    saveTheme: (theme) => userConfigStore.update({ theme }),
  });
  titlebarController = createTitlebarController({
    documentLike: document,
    appWindow: tauriWindow.getCurrentWindow(),
    t,
    shouldConfirmClose: () => scriptWorkspace.hasUnsavedChanges(),
    confirmClose: () =>
      dialog.confirm(t("close.unsavedConfirmation"), {
        title: "AHKforge",
        kind: "warning",
        okLabel: t("button.closeAnyway"),
        cancelLabel: t("button.cancel"),
      }),
  });

  distinguishSidesToggles.forEach((toggle) => {
    toggle.addEventListener("change", () => {
      setDistinguishSides(toggle.checked, distinguishSidesToggles);
    });
  });
  keyboardLayoutSelects.forEach((select) => {
    select.addEventListener("change", (event) => {
      const layout = event.currentTarget.value;
      keyboardLayoutSelects.forEach((layoutSelect) => {
        layoutSelect.value = layout;
      });
      keyboardLayoutPickerController.sync();
      applyKeyboardLayout(layout);
      userConfigStore.update({ keyboardLayout: layout });
      hotkeysController.clearSelection();
      remapsController.clearSelection();
    });
  });
  languageSelect.addEventListener("change", () => {
    setLanguage(languageSelect.value, languageSelect, true);
    renderAll();
  });
  repositoryLink.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await opener.openUrl(repositoryLink.href);
    } catch (error) {
      console.warn("Could not open the AHKforge repository:", error);
    }
  });
  resetConfigButton.addEventListener("click", async () => {
    const confirmed = await dialog.confirm(t("settings.resetConfirmation"), {
      title: "AHKforge",
      kind: "warning",
      okLabel: t("button.resetConfig"),
      cancelLabel: t("button.cancel"),
    });
    if (!confirmed) return;

    resetConfigButton.disabled = true;
    settingsStatus.className = "status-msg";
    setAnimatedMessage(settingsStatus, t("status.resettingConfig"));
    try {
      await core.invoke("reset_user_config");
    } catch (error) {
      resetConfigButton.disabled = false;
      settingsStatus.className = "status-msg status-error";
      setAnimatedMessage(
        settingsStatus,
        t("status.resetConfigError", { error })
      );
    }
  });

  try {
    await i18n.load();
  } catch (error) {
    console.warn("Could not load translations:", error);
  }
  await userConfigStore.load();

  const config = userConfigStore.get();
  const savedLayout = isSupportedKeyboardLayout(config.keyboardLayout)
    ? config.keyboardLayout
    : "qwerty";
  keyboardLayoutSelects.forEach((select) => {
    select.value = savedLayout;
  });
  keyboardLayoutPickerController.sync();
  applyKeyboardLayout(savedLayout);

  const language =
    resolveSupportedLanguage(config.language) || i18n.detectLanguage();
  setLanguage(language, languageSelect);
  hotkeysController.updateModifierLabels();
  remapsController.updateModifierLabels();

  hotkeysController.init();
  hotstringsController.init();
  remapsController.init();
  modesController.init();
  scriptWorkspace.init();
  ahkVersionController.init();
  languagePickerController.init();
  keyboardLayoutPickerController.init();
  themeController.init();
  titlebarController.init();
  inputCapture.init();
  mouseOnlyInteraction.init();
  renderAll();
});
