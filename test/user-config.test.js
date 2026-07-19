import assert from "node:assert/strict";
import test from "node:test";

import {
  createUserConfigStore,
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
    ...dependencies,
  });

  await store.load();
  store.update({ theme: "dark" });
  store.update({ theme: "light" });
  await store.flush();

  assert.deepEqual(savedThemes, ["dark", "light"]);
  assert.equal(store.get().theme, "light");
});
