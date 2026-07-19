export const DEFAULT_USER_CONFIG = {
  language: null,
  theme: null,
  keyboardLayout: null,
  ahkVersion: "v2",
};

export function normalizeUserConfig(config, { resolveLanguage, isKeyboardLayout }) {
  return {
    language: resolveLanguage(config?.language) || null,
    theme: config?.theme === "light" || config?.theme === "dark" ? config.theme : null,
    keyboardLayout: isKeyboardLayout(config?.keyboardLayout) ? config.keyboardLayout : null,
    ahkVersion: config?.ahkVersion === "v1" ? "v1" : "v2",
  };
}

export function createUserConfigStore({
  invoke,
  resolveLanguage,
  isKeyboardLayout,
  warn = console.warn,
}) {
  const dependencies = { resolveLanguage, isKeyboardLayout };
  let config = { ...DEFAULT_USER_CONFIG };
  let saveQueue = Promise.resolve();

  function queueSave() {
    const snapshot = { ...config };
    saveQueue = saveQueue
      .catch(() => {})
      .then(() => invoke("save_user_config", { config: snapshot }))
      .catch((error) => {
        warn("Could not save user config:", error);
      });
    return saveQueue;
  }

  async function load() {
    try {
      config = normalizeUserConfig(await invoke("load_user_config"), dependencies);
    } catch (error) {
      warn("Could not load user config:", error);
      config = { ...DEFAULT_USER_CONFIG };
    }

    return get();
  }

  function get() {
    return { ...config };
  }

  function update(patch) {
    config = normalizeUserConfig({ ...config, ...patch }, dependencies);
    queueSave();
    return get();
  }

  return {
    load,
    get,
    update,
    flush: () => saveQueue,
  };
}
