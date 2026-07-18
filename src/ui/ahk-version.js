import { DEFAULT_AHK_VERSION, normalizeAhkVersion } from "../ahk/versions.js";

export function createAhkVersionController({
  toggle,
  getSavedVersion,
  saveVersion,
  onChange,
}) {
  let currentVersion = DEFAULT_AHK_VERSION;

  function apply(version, { persist = false, notify = false } = {}) {
    currentVersion = normalizeAhkVersion(version);
    toggle.checked = currentVersion === "v2";
    toggle.setAttribute("aria-checked", String(toggle.checked));

    if (persist) saveVersion(currentVersion);
    if (notify) onChange(currentVersion);
    return currentVersion;
  }

  function handleToggle() {
    apply(toggle.checked ? "v2" : "v1", { persist: true, notify: true });
  }

  function init() {
    apply(getSavedVersion());
  }

  toggle.addEventListener("change", handleToggle);

  return {
    init,
    apply,
    getVersion: () => currentVersion,
    handleToggle,
  };
}
