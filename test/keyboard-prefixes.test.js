import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPrefix,
  isModifierActive,
  parsePrefix,
  toggleModifierInSet,
} from "../src/keyboard/prefixes.js";

test("generic prefixes collapse left and right modifier variants", () => {
  assert.equal(buildPrefix(new Set(["RCtrl", "LShift", "RWin"]), "j"), "^+#j");
  assert.equal(buildPrefix(new Set(["LCtrl", "RCtrl"]), "a"), "^a");
});

test("side-specific prefixes preserve supported modifier sides", () => {
  assert.equal(buildPrefix(new Set(["RCtrl", "LShift", "RWin"]), "j", true), ">^<+>#j");
  assert.equal(buildPrefix(new Set(["AltGr"]), "q", true), "<^>!q");
});

test("prefix parser recognizes generic and side-specific symbols", () => {
  assert.deepEqual(parsePrefix("^+j"), {
    mods: new Set(["LCtrl", "LShift"]),
    key: "j",
  });
  assert.deepEqual(parsePrefix(">^<+#k"), {
    mods: new Set(["RCtrl", "LShift", "LWin"]),
    key: "k",
  });
  assert.deepEqual(parsePrefix("<^>!q"), {
    mods: new Set(["AltGr"]),
    key: "q",
  });
});

test("generic modifier toggles operate on the whole modifier family", () => {
  const modifiers = new Set();

  toggleModifierInSet(modifiers, "LCtrl", false);
  assert.deepEqual(modifiers, new Set(["LCtrl"]));
  assert.equal(isModifierActive("RCtrl", "Ctrl", modifiers, false), true);

  toggleModifierInSet(modifiers, "RCtrl", false);
  assert.deepEqual(modifiers, new Set());
});

test("side-specific modifier toggles remain independent", () => {
  const modifiers = new Set();

  toggleModifierInSet(modifiers, "LCtrl", true);
  toggleModifierInSet(modifiers, "RCtrl", true);
  assert.deepEqual(modifiers, new Set(["LCtrl", "RCtrl"]));
  assert.equal(isModifierActive("LCtrl", "Ctrl", modifiers, true), true);
  assert.equal(isModifierActive("RShift", "Shift", modifiers, true), false);
});
