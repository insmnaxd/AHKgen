import assert from "node:assert/strict";
import test from "node:test";

import {
  createMouseOnlyInteraction,
  shouldBlockKeyboardEvent,
} from "../src/ui/mouse-only-interaction.js";

function createElement({ selectorMatches = [], mouseOnly = false } = {}) {
  return {
    matches: (selector) =>
      selector
        .split(",")
        .map((part) => part.trim())
        .some((part) => selectorMatches.includes(part)),
    closest: (selector) =>
      mouseOnly && selector === "[data-mouse-only]" ? {} : null,
  };
}

test("Tab remains available for regular controls", () => {
  assert.equal(
    shouldBlockKeyboardEvent({
      key: "Tab",
      target: createElement({ selectorMatches: ["input"] }),
    }),
    false
  );
});

test("regular buttons and selects keep their native keyboard behavior", () => {
  const button = createElement({ selectorMatches: ["button"] });
  const select = createElement({ selectorMatches: ["select"] });

  assert.equal(shouldBlockKeyboardEvent({ key: "Enter", target: button }), false);
  assert.equal(shouldBlockKeyboardEvent({ key: "ArrowDown", target: select }), false);
});

test("browser find shortcut is blocked even in text fields", () => {
  const input = createElement({ selectorMatches: ["input"] });

  assert.equal(
    shouldBlockKeyboardEvent({
      key: "f",
      ctrlKey: true,
      altKey: false,
      target: input,
    }),
    true
  );
  assert.equal(
    shouldBlockKeyboardEvent({
      key: "F",
      ctrlKey: true,
      altKey: false,
      target: input,
    }),
    true
  );
  assert.equal(
    shouldBlockKeyboardEvent({
      key: "f",
      ctrlKey: false,
      altKey: false,
      target: input,
    }),
    false
  );
});

test("keyboard input is blocked only inside mouse-only regions", () => {
  const visualKey = createElement({
    selectorMatches: ["button"],
    mouseOnly: true,
  });

  assert.equal(shouldBlockKeyboardEvent({ key: "Enter", target: visualKey }), true);
  assert.equal(shouldBlockKeyboardEvent({ key: "Tab", target: visualKey }), false);
});

test("only controls inside mouse-only regions are removed from the tab order", () => {
  const tabIndexes = new Map();
  const regularButton = {
    closest: () => null,
    setAttribute: (name, value) => tabIndexes.set(`regular:${name}`, value),
  };
  const visualKey = {
    closest: (selector) => (selector === "[data-mouse-only]" ? {} : null),
    setAttribute: (name, value) => tabIndexes.set(`visual:${name}`, value),
  };
  const controller = createMouseOnlyInteraction({
    documentLike: {},
    MutationObserverClass: class {},
  });

  controller.removeFromTabOrder({
    querySelectorAll: () => [regularButton, visualKey],
  });

  assert.equal(tabIndexes.has("regular:tabindex"), false);
  assert.equal(tabIndexes.get("visual:tabindex"), "-1");
});

test("context menu is disabled globally", () => {
  const controller = createMouseOnlyInteraction({
    documentLike: {},
    MutationObserverClass: class {},
  });
  let prevented = false;
  let stopped = false;

  controller.handleContextMenu({
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      stopped = true;
    },
  });

  assert.equal(prevented, true);
  assert.equal(stopped, true);
});
