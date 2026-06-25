import assert from "node:assert/strict";
import test from "node:test";

import {
  isTextEntryElement,
  shouldBlockKeyboardEvent,
} from "../src/ui/mouse-only-interaction.js";

function createElement({ selectorMatches = [], type = "", closest = false } = {}) {
  return {
    type,
    matches: (selector) =>
      selector
        .split(",")
        .map((part) => part.trim())
        .some((part) => selectorMatches.includes(part)),
    closest: () => (closest ? {} : null),
  };
}

test("Tab is blocked for every target", () => {
  assert.equal(
    shouldBlockKeyboardEvent({
      key: "Tab",
      target: createElement({ selectorMatches: ["input"], type: "text" }),
    }),
    true
  );
});

test("typing and cursor movement remain enabled in text fields", () => {
  const input = createElement({ selectorMatches: ["input"], type: "text" });
  const textarea = createElement({ selectorMatches: ["textarea"] });

  assert.equal(isTextEntryElement(input), true);
  assert.equal(isTextEntryElement(textarea), true);
  assert.equal(shouldBlockKeyboardEvent({ key: "ArrowLeft", target: input }), false);
  assert.equal(shouldBlockKeyboardEvent({ key: "a", target: textarea }), false);
});

test("keyboard input is blocked for non-text controls", () => {
  const button = createElement({ closest: true });
  const select = createElement({ closest: true });

  assert.equal(shouldBlockKeyboardEvent({ key: "Enter", target: button }), true);
  assert.equal(shouldBlockKeyboardEvent({ key: "ArrowDown", target: select }), true);
});
