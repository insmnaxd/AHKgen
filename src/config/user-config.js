export const DEFAULT_USER_CONFIG = {
  language: null,
  theme: null,
  keyboardLayout: null,
  ahkVersion: "v2",
};

export const LEGACY_STORAGE_KEYS = {
  language: "ahkgen.language",
  theme: "ahkgen.theme",
  keyboardLayout: "ahkgen.keyboardLayout",
};

export function normalizeUserConfig(config, { resolveLanguage, isKeyboardLayout }) {
  return {
    language: resolveLanguage(config?.language) || null,
    theme: config?.theme === "light" || config?.theme === "dark" ? config.theme : null,
    keyboardLayout: isKeyboardLayout(config?.keyboardLayout) ? config.keyboardLayout : null,
    ahkVersion: config?.ahkVersion === "v1" ? "v1" : "v2",
  };
}

export function mergeLegacyPreferences(config, legacy, dependencies) {
  const migrated = { ...config };

  if (!migrated.language) {
    migrated.language = dependencies.resolveLanguage(legacy.language);
  }
  if (!migrated.theme) {
    migrated.theme = legacy.theme === "light" || legacy.theme === "dark" ? legacy.theme : null;
  }
  if (!migrated.keyboardLayout) {
    migrated.keyboardLayout = dependencies.isKeyboardLayout(legacy.keyboardLayout)
      ? legacy.keyboardLayout
      : null;
  }

  const normalized = normalizeUserConfig(migrated, dependencies);
  return {
    config: normalized,
    changed: JSON.stringify(normalized) !== JSON.stringify(config),
  };
}

function readLegacyPreferences(storage) {
  const preferences = {};

  for (const [name, storageKey] of Object.entries(LEGACY_STORAGE_KEYS)) {
    try {
      preferences[name] = storage.getItem(storageKey);
    } catch {
      preferences[name] = null;
    }
  }

  return preferences;
}

export function createUserConfigStore({
  invoke,
  storage,
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

    const migration = mergeLegacyPreferences(config, readLegacyPreferences(storage), dependencies);
    config = migration.config;
    if (migration.changed) {
      await queueSave();
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

  function clearLegacyPreferences() {
    for (const storageKey of Object.values(LEGACY_STORAGE_KEYS)) {
      try {
        storage.removeItem(storageKey);
      } catch (error) {
        warn(`Could not remove legacy preference ${storageKey}:`, error);
      }
    }
  }

  return {
    load,
    get,
    update,
    flush: () => saveQueue,
    clearLegacyPreferences,
  };
}
