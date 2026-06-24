import assert from "node:assert/strict";
import test from "node:test";

import { getImportStatus, mergeParsedEntries } from "../src/ahk/import.js";

test("parsed entries are merged while preserving existing unique bindings", () => {
  const target = {
    hotkeys: [{ prefix: "^a" }],
    hotstrings: [{ trigger: "sig", caseSensitive: false }],
    remaps: [{ fromPrefix: "CapsLock" }],
  };
  const parsed = {
    hotkeys: [{ prefix: "^a" }, { prefix: "^b" }],
    hotstrings: [
      { trigger: "sig", caseSensitive: false },
      { trigger: "sig", caseSensitive: true },
    ],
    remaps: [
      { fromPrefix: "CapsLock", toPrefix: "Esc" },
      { fromPrefix: "a", toPrefix: "b" },
    ],
  };

  assert.deepEqual(mergeParsedEntries(target, parsed), {
    added: { hotkeys: 1, hotstrings: 1, remaps: 1 },
    duplicates: { hotkeys: 1, hotstrings: 1, remaps: 1 },
  });
  assert.equal(target.hotkeys.length, 2);
  assert.equal(target.hotstrings.length, 2);
  assert.equal(target.remaps.length, 2);
});

test("import status reports added, skipped, and duplicate entries", () => {
  const t = (key, values = {}) => {
    const messages = {
      "count.hotkeys": `${values.count} hotkeys`,
      "count.hotstrings": `${values.count} hotstrings`,
      "count.remaps": `${values.count} remaps`,
      "status.loaded": `Loaded: ${values.parts}.`,
      "status.noNewEntries": "No new entries.",
      "status.skipped": ` ${values.count} skipped.`,
      "status.duplicates": ` ${values.count} duplicates.`,
    };
    return messages[key];
  };

  assert.equal(
    getImportStatus(
      {
        added: { hotkeys: 2, hotstrings: 0, remaps: 1 },
        duplicates: { hotkeys: 1, hotstrings: 2, remaps: 0 },
      },
      4,
      t
    ),
    "Loaded: 2 hotkeys, 1 remaps. 4 skipped. 3 duplicates."
  );
});

test("import status handles a file containing only duplicates", () => {
  const t = (key, values = {}) =>
    key === "status.noNewEntries"
      ? "No new entries."
      : key === "status.duplicates"
        ? ` ${values.count} duplicates.`
        : "";

  assert.equal(
    getImportStatus(
      {
        added: { hotkeys: 0, hotstrings: 0, remaps: 0 },
        duplicates: { hotkeys: 1, hotstrings: 1, remaps: 1 },
      },
      0,
      t
    ),
    "No new entries. 3 duplicates."
  );
});
