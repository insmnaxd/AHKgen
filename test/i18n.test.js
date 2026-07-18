import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createI18n,
  detectSystemLanguage,
  interpolate,
  resolveSupportedLanguage,
  SUPPORTED_LANGUAGES,
} from "../src/i18n/index.js";

test("language resolution accepts exact and regional locales", () => {
  assert.equal(resolveSupportedLanguage("pl"), "pl");
  assert.equal(resolveSupportedLanguage("PL-pl"), "pl");
  assert.equal(resolveSupportedLanguage("en-US"), "en");
  assert.equal(resolveSupportedLanguage("ja-JP"), null);
});

test("system language detection uses the first supported locale", () => {
  assert.equal(
    detectSystemLanguage({
      languages: ["ja-JP", "de-DE", "en-US"],
      language: "ja-JP",
    }),
    "de"
  );
  assert.equal(detectSystemLanguage({ languages: [], language: "ja-JP" }), "en");
});

test("translation interpolation preserves unknown placeholders", () => {
  assert.equal(
    interpolate("Loaded {count} items from {path}.", { count: 3 }),
    "Loaded 3 items from {path}."
  );
});

test("i18n loads dictionaries and falls back to English", async () => {
  const dictionaries = {
    en: {
      greeting: "Hello {name}",
      fallback: "English fallback",
    },
    pl: {
      greeting: "Cześć {name}",
    },
  };

  const i18n = createI18n({
    fetchFn: async (path) => {
      const language = path.match(/\/([a-z]+)\.json$/)?.[1];
      return {
        ok: true,
        json: async () => dictionaries[language] || {},
      };
    },
    navigatorLike: {
      languages: ["pl-PL"],
      language: "pl-PL",
    },
  });

  await i18n.load();
  assert.equal(i18n.detectLanguage(), "pl");
  assert.equal(i18n.setLanguage("pl-PL"), "pl");
  assert.equal(i18n.t("greeting", { name: "Ada" }), "Cześć Ada");
  assert.equal(i18n.t("fallback"), "English fallback");
  assert.equal(i18n.t("missing.key"), "missing.key");
});

test("translation files have matching keys, placeholders, and non-empty values", async () => {
  const dictionaries = {};

  for (const language of SUPPORTED_LANGUAGES) {
    const fileUrl = new URL(`../src/i18n/${language}.json`, import.meta.url);
    dictionaries[language] = JSON.parse(await readFile(fileUrl, "utf8"));
  }

  const englishKeys = Object.keys(dictionaries.en).sort();
  const placeholders = (value) =>
    [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

  for (const language of SUPPORTED_LANGUAGES) {
    const dictionary = dictionaries[language];
    assert.deepEqual(Object.keys(dictionary).sort(), englishKeys, `${language}: key mismatch`);

    for (const key of englishKeys) {
      assert.equal(typeof dictionary[key], "string", `${language}.${key}: not a string`);
      assert.notEqual(dictionary[key].trim(), "", `${language}.${key}: empty translation`);
      assert.deepEqual(
        placeholders(dictionary[key]),
        placeholders(dictionaries.en[key]),
        `${language}.${key}: placeholder mismatch`
      );
    }
  }
});
