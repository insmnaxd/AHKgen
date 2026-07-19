import { mergeParsedEntries, getImportStatus } from "../ahk/import.js";
import { buildFullScript } from "../ahk/generator.js";
import { parseAhkScript } from "../ahk/parser.js";
import {
  setAnimatedMessage,
  startMessageExit,
} from "./status-message.js";

const AHK_FILE_FILTERS = [
  { name: "AutoHotkey Script", extensions: ["ahk"] },
];
const SUCCESS_STATUS_DURATION = 4000;
const ERROR_STATUS_DURATION = 7000;
const STATUS_EXIT_DURATION = 180;

export function createScriptWorkspace({
  documentLike,
  version,
  entries,
  t,
  clipboard,
  fileSystem,
  dialogs,
  onEntriesChanged,
  getAhkVersion = () => "v1",
  onAhkVersionDetected = () => {},
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  const preview = documentLike.querySelector("#script-preview");
  const status = documentLike.querySelector("#action-status");
  let statusTimeoutId = null;
  let cleanEntries = null;

  function getEntriesSnapshot() {
    return JSON.stringify(entries);
  }

  function render() {
    preview.value = buildFullScript({ version, ahkVersion: getAhkVersion(), ...entries });
    if (cleanEntries === null) cleanEntries = getEntriesSnapshot();
  }

  function markClean() {
    cleanEntries = getEntriesSnapshot();
  }

  function hasUnsavedChanges() {
    return cleanEntries !== null && getEntriesSnapshot() !== cleanEntries;
  }

  function setStatus(message, isError = false, autoClear = true) {
    if (statusTimeoutId) {
      clearTimeoutFn(statusTimeoutId);
      statusTimeoutId = null;
    }

    status.className = isError
      ? "status-msg status-error"
      : "status-msg status-success";
    setAnimatedMessage(status, message);

    if (autoClear) {
      statusTimeoutId = setTimeoutFn(() => {
        startMessageExit(status);
        statusTimeoutId = setTimeoutFn(() => {
          status.textContent = "";
          status.className = "status-msg";
          statusTimeoutId = null;
        }, STATUS_EXIT_DURATION);
      }, isError ? ERROR_STATUS_DURATION : SUCCESS_STATUS_DURATION);
    }
  }

  async function copy() {
    try {
      await clipboard.writeText(preview.value);
      setStatus(t("status.copied"));
    } catch (error) {
      setStatus(t("status.copyError", { error }), true);
    }
  }

  async function save() {
    try {
      const filePath = await dialogs.save({
        filters: AHK_FILE_FILTERS,
        defaultPath: "script.ahk",
      });
      if (!filePath) return;

      await fileSystem.writeTextFile(filePath, `\uFEFF${preview.value}`);
      markClean();
      setStatus(t("status.saved", { path: filePath }));
    } catch (error) {
      setStatus(t("status.saveError", { error }), true);
    }
  }

  async function open() {
    try {
      const filePath = await dialogs.open({
        multiple: false,
        filters: AHK_FILE_FILTERS,
      });
      if (!filePath) return;

      const canAdoptOpenedFile =
        !hasUnsavedChanges() &&
        entries.hotkeys.length === 0 &&
        entries.hotstrings.length === 0 &&
        entries.remaps.length === 0;
      const result = parseAhkScript(await fileSystem.readTextFile(filePath));
      if (!result.success) {
        setStatus(t(result.errorKey), true);
        return;
      }
      if (
        result.hotkeys.length === 0 &&
        result.hotstrings.length === 0 &&
        result.remaps.length === 0
      ) {
        setStatus(t("status.noRecognizableEntries"), true);
        return;
      }

      if (canAdoptOpenedFile) onAhkVersionDetected(result.ahkVersion);
      const summary = mergeParsedEntries(entries, result);
      onEntriesChanged();
      if (canAdoptOpenedFile) markClean();
      setStatus(getImportStatus(summary, result.skippedCount, t));
    } catch (error) {
      setStatus(t("status.openError", { error }), true);
    }
  }

  function init() {
    documentLike.querySelector("#copy-btn").addEventListener("click", copy);
    documentLike.querySelector("#save-btn").addEventListener("click", save);
    documentLike.querySelector("#open-file-btn").addEventListener("click", open);
  }

  return { init, render, setStatus, markClean, hasUnsavedChanges };
}
