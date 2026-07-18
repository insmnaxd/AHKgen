import assert from "node:assert/strict";
import test from "node:test";

import { createAhkVersionController } from "../src/ui/ahk-version.js";

test("AHK version controller restores and persists toggle changes", () => {
  let changeHandler;
  const saved = [];
  const changed = [];
  const attributes = new Map();
  const toggle = {
    checked: false,
    addEventListener: (type, handler) => {
      if (type === "change") changeHandler = handler;
    },
    setAttribute: (name, value) => attributes.set(name, value),
  };
  const controller = createAhkVersionController({
    toggle,
    getSavedVersion: () => "v2",
    saveVersion: (version) => saved.push(version),
    onChange: (version) => changed.push(version),
  });

  controller.init();
  assert.equal(controller.getVersion(), "v2");
  assert.equal(toggle.checked, true);

  toggle.checked = false;
  changeHandler();

  assert.equal(controller.getVersion(), "v1");
  assert.deepEqual(saved, ["v1"]);
  assert.deepEqual(changed, ["v1"]);
  assert.equal(attributes.get("aria-checked"), "false");
});

test("AHK version controller defaults to v2 without a saved preference", () => {
  const toggle = {
    checked: false,
    addEventListener: () => {},
    setAttribute: () => {},
  };
  const controller = createAhkVersionController({
    toggle,
    getSavedVersion: () => null,
    saveVersion: () => {},
    onChange: () => {},
  });

  controller.init();

  assert.equal(controller.getVersion(), "v2");
  assert.equal(toggle.checked, true);
});
