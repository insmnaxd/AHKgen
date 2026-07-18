import assert from "node:assert/strict";
import test from "node:test";

import { createAutoResizeTextarea } from "../src/ui/auto-resize-textarea.js";

function createTextarea(scrollHeight) {
  const listeners = new Map();
  return {
    scrollHeight,
    style: {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type) {
      listeners.get(type)?.();
    },
  };
}

test("textarea grows with its content and stops at the configured maximum", () => {
  const textarea = createTextarea(96);
  const autoResize = createAutoResizeTextarea(textarea);

  autoResize.init();
  assert.equal(textarea.style.height, "96px");
  assert.equal(textarea.style.overflowY, "hidden");

  textarea.scrollHeight = 320;
  textarea.dispatch("input");
  assert.equal(textarea.style.height, "240px");
  assert.equal(textarea.style.overflowY, "auto");
});

test("textarea returns to its minimum height after content is cleared", () => {
  const textarea = createTextarea(180);
  const autoResize = createAutoResizeTextarea(textarea);

  autoResize.init();
  textarea.scrollHeight = 0;
  autoResize.resize();

  assert.equal(textarea.style.height, "40px");
  assert.equal(textarea.style.overflowY, "hidden");
});
