import assert from "node:assert/strict";
import test from "node:test";

import { createModesController } from "../src/ui/modes.js";

function createElement({ mode = "" } = {}) {
  const listeners = new Map();
  const attributes = new Map();
  const classes = new Set();
  return {
    dataset: { mode },
    tabIndex: 0,
    focused: false,
    classList: {
      toggle: (name, enabled) =>
        enabled ? classes.add(name) : classes.delete(name),
    },
    setAttribute: (name, value) => attributes.set(name, value),
    addEventListener: (type, handler) => listeners.set(type, handler),
    focus() {
      this.focused = true;
    },
    dispatch(type, event = {}) {
      listeners.get(type)?.(event);
    },
    getAttribute: (name) => attributes.get(name),
  };
}

function createHarness() {
  const modes = ["hotkeys", "hotstrings", "remap", "settings"];
  const tabs = modes.map((mode) => createElement({ mode }));
  const elements = new Map([
    ["#mode-section-hotkeys", createElement()],
    ["#list-section-hotkeys", createElement()],
    ["#mode-section-hotstrings", createElement()],
    ["#list-section-hotstrings", createElement()],
    ["#mode-section-remap", createElement()],
    ["#list-section-remap", createElement()],
    ["#mode-section-settings", createElement()],
    ["#script-preview-section", createElement()],
  ]);
  const switched = [];
  const controller = createModesController({
    documentLike: {
      querySelectorAll: () => tabs,
      querySelector: (selector) => elements.get(selector),
    },
    onSwitch: (mode) => switched.push(mode),
  });
  controller.init();
  return { controller, elements, switched, tabs };
}

test("mode tabs expose one selected tab and matching tab panels", () => {
  const { controller, elements, tabs } = createHarness();

  controller.switchTo("hotstrings");

  assert.equal(tabs[1].getAttribute("aria-selected"), "true");
  assert.equal(tabs[1].tabIndex, 0);
  assert.equal(tabs[0].getAttribute("aria-selected"), "false");
  assert.equal(tabs[0].tabIndex, -1);
  assert.equal(
    elements.get("#mode-section-hotstrings").getAttribute("aria-hidden"),
    "false"
  );
  assert.equal(
    elements.get("#mode-section-hotkeys").getAttribute("aria-hidden"),
    "true"
  );
});

test("arrow, Home, and End keys move and focus mode tabs", () => {
  const { switched, tabs } = createHarness();
  let prevented = false;

  tabs[0].dispatch("keydown", {
    key: "ArrowLeft",
    preventDefault: () => (prevented = true),
  });

  assert.equal(prevented, true);
  assert.equal(switched.at(-1), "settings");
  assert.equal(tabs[3].focused, true);

  tabs[3].dispatch("keydown", { key: "Home", preventDefault() {} });
  assert.equal(switched.at(-1), "hotkeys");
  assert.equal(tabs[0].focused, true);
});
