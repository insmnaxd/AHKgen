import assert from "node:assert/strict";
import test from "node:test";

import {
  MOUSE_LAYOUT,
  STANDARD_KEYBOARD_LAYOUT,
} from "../src/keyboard/visual-layout.js";
import { buildVisualInputHtml } from "../src/ui/visual-input.js";

function collectRowKeys(section) {
  return section.rows.flat().filter((item) => !item.spacer);
}

test("standard keyboard layout exposes all full-size keyboard clusters", () => {
  const keyboard = STANDARD_KEYBOARD_LAYOUT;
  const keys = [
    ...collectRowKeys(keyboard.functionRow.main),
    ...collectRowKeys(keyboard.functionRow.system),
    ...collectRowKeys(keyboard.main),
    ...collectRowKeys(keyboard.navigation),
    ...keyboard.numpad.keys,
  ];
  const names = new Set(keys.map(({ key }) => key));

  assert.equal(keys.length, 104);
  assert.equal(names.size, 104);
  assert.ok(names.has("Backspace"));
  assert.ok(names.has("AppsKey"));
  assert.ok(names.has("PrintScreen"));
  assert.ok(names.has("NumpadEnter"));
});

test("mouse layout exposes buttons and four wheel directions", () => {
  assert.deepEqual(
    MOUSE_LAYOUT.map(({ key }) => key),
    [
      "LButton",
      "RButton",
      "WheelUp",
      "MButton",
      "WheelDown",
      "XButton1",
      "XButton2",
      "WheelLeft",
      "WheelRight",
    ]
  );
});

test("visual input renderer keeps the controller data contract", () => {
  const html = buildVisualInputHtml();

  assert.match(html, /class="kb-key kb-modifier" data-key="LCtrl"/);
  assert.match(html, /data-side="L" data-base="Ctrl"/);
  assert.match(html, /data-key="NumpadAdd"/);
  assert.match(html, /data-key="WheelRight"/);
  assert.match(html, /data-i18n="device\.mouse"/);
});
