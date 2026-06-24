import { mergeParsedEntries, getImportStatus } from "../ahk/import.js";
import { buildFullScript } from "../ahk/generator.js";
import { parseAhkScript } from "../ahk/parser.js";

const AHK_FILE_FILTERS = [
  { name: "AutoHotkey Script", extensions: ["ahk"] },
];

export function createScriptWorkspace({
  documentLike,
  version,
  entries,
  t,
  clipboard,
  fileSystem,
  dialogs,
  onEntriesChanged,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  const preview = documentLike.querySelector("#script-preview");
  const status = documentLike.querySelector("#action-status");
  let statusTimeoutId = null;

  function render() {
    preview.value = buildFullScript({ version, ...entries });
  }

  function setStatus(message, isError = false, autoClear = true) {
    if (statusTimeoutId) {
      clearTimeoutFn(statusTimeoutId);
      statusTimeoutId = null;
    }

    status.textContent = message;
    status.className = isError
      ? "status-msg status-error"
      : "status-msg status-success";

    if (autoClear && !isError) {
      statusTimeoutId = setTimeoutFn(() => {
        status.textContent = "";
        status.className = "status-msg";
        statusTimeoutId = null;
      }, 4000);
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

      const summary = mergeParsedEntries(entries, result);
      onEntriesChanged();
      setStatus(getImportStatus(summary, result.skippedCount, t), false, false);
    } catch (error) {
      setStatus(t("status.openError", { error }), true);
    }
  }

  function init() {
    documentLike.querySelector("#copy-btn").addEventListener("click", copy);
    documentLike.querySelector("#save-btn").addEventListener("click", save);
    documentLike.querySelector("#open-file-btn").addEventListener("click", open);
  }

  return { init, render, setStatus };
}
