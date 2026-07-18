import assert from "node:assert/strict";
import test from "node:test";

import {
  createUserConfigStore,
  mergeLegacyPreferences,
  normalizeUserConfig,
} from "../src/config/user-config.js";
import { isSupportedKeyboardLayout } from "../src/keyboard/layouts.js";

const SUPPORTED_LANGUAGES = ["en", "pl", "de"];

function resolveLanguage(locale) {
  if (!locale) return null;
  const normalized = locale.toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(normalized)) return normalized;
  const base = normalized.split("-")[0];
  return SUPPORTED_LANGUAGES.includes(base) ? base : null;
}

const dependencies = {
  resolveLanguage,
  isKeyboardLayout: isSupportedKeyboardLayout,
};

test("config normalization rejects unsupported values", () => {
  assert.deepEqual(
    normalizeUserConfig(
      {
        language: "PL-pl",
        theme: "sepia",
        keyboardLayout: "dvorak",
        ignored: true,
      },
      dependencies
    ),
    {
      language: "pl",
      theme: null,
      keyboardLayout: null,
      ahkVersion: "v2",
    }
  );
});

test("legacy preferences only fill missing config fields", () => {
  assert.deepEqual(
    mergeLegacyPreferences(
      { language: "en", theme: null, keyboardLayout: null },
      { language: "pl", theme: "dark", keyboardLayout: "azerty" },
      dependencies
    ),
    {
      config: {
        language: "en",
        theme: "dark",
        keyboardLayout: "azerty",
        ahkVersion: "v2",
      },
      changed: true,
    }
  );
});

test("config store loads, migrates and persists legacy preferences", async () => {
  const calls = [];
  const storageValues = new Map([
    ["ahkgen.language", "pl-PL"],
    ["ahkgen.theme", "dark"],
    ["ahkgen.keyboardLayout", "qwertz"],
  ]);

  const store = createUserConfigStore({
    invoke: async (command, payload) => {
      calls.push({ command, payload });
      if (command === "load_user_config") {
        return { language: null, theme: null, keyboardLayout: null, ahkVersion: null };
      }
    },
    storage: {
      getItem: (key) => storageValues.get(key) ?? null,
      removeItem: (key) => storageValues.delete(key),
    },
    ...dependencies,
  });

  assert.deepEqual(await store.load(), {
    language: "pl",
    theme: "dark",
    keyboardLayout: "qwertz",
    ahkVersion: "v2",
  });
  assert.deepEqual(calls.at(-1), {
    command: "save_user_config",
    payload: {
      config: {
        language: "pl",
        theme: "dark",
        keyboardLayout: "qwertz",
        ahkVersion: "v2",
      },
    },
  });
});

test("config stores only supported AutoHotkey versions", () => {
  assert.equal(
    normalizeUserConfig({ ahkVersion: "v2" }, dependencies).ahkVersion,
    "v2"
  );
  assert.equal(
    normalizeUserConfig({ ahkVersion: "v3" }, dependencies).ahkVersion,
    "v2"
  );
});

test("config store serializes rapid saves in update order", async () => {
  const savedThemes = [];
  const store = createUserConfigStore({
    invoke: async (command, payload) => {
      if (command === "load_user_config") return {};
      savedThemes.push(payload.config.theme);
    },
    storage: {
      getItem: () => null,
      removeItem: () => {},
    },
    ...dependencies,
  });

  await store.load();
  store.update({ theme: "dark" });
  store.update({ theme: "light" });
  await store.flush();

  assert.deepEqual(savedThemes, ["dark", "light"]);
  assert.equal(store.get().theme, "light");
});
