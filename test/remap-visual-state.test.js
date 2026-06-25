import assert from "node:assert/strict";
import test from "node:test";

import { getRemapKeyVisualState } from "../src/remaps/visual-state.js";

const from = {
  modifiers: new Set(["LCtrl"]),
  key: "a",
};
const to = {
  modifiers: new Set(["RShift"]),
  key: "b",
};

test("remap keyboard shows the opposite selection as a ghost", () => {
  assert.deepEqual(
    getRemapKeyVisualState({
      buttonKey: "a",
      activeSelection: to,
      inactiveSelection: from,
      distinguishSides: true,
    }),
    { active: false, ghost: true }
  );
  assert.deepEqual(
    getRemapKeyVisualState({
      buttonKey: "b",
      activeSelection: to,
      inactiveSelection: from,
      distinguishSides: true,
    }),
    { active: true, ghost: false }
  );
});

test("remap keyboard ghosts modifiers using the current side setting", () => {
  assert.deepEqual(
    getRemapKeyVisualState({
      buttonKey: "RCtrl",
      modifierBase: "Ctrl",
      activeSelection: to,
      inactiveSelection: from,
      distinguishSides: false,
    }),
    { active: false, ghost: true }
  );
  assert.deepEqual(
    getRemapKeyVisualState({
      buttonKey: "RCtrl",
      modifierBase: "Ctrl",
      activeSelection: to,
      inactiveSelection: from,
      distinguishSides: true,
    }),
    { active: false, ghost: false }
  );
});

test("active styling can take precedence when both sides use the same key", () => {
  assert.deepEqual(
    getRemapKeyVisualState({
      buttonKey: "a",
      activeSelection: from,
      inactiveSelection: from,
      distinguishSides: true,
    }),
    { active: true, ghost: true }
  );
});
