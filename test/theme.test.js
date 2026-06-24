import assert from "node:assert/strict";
import test from "node:test";

import { createThemeController, getSystemTheme } from "../src/ui/theme.js";

function createWindowMock(initiallyDark = false) {
  let changeHandler = null;
  const mediaQuery = {
    matches: initiallyDark,
    addEventListener: (event, handler) => {
      if (event === "change") changeHandler = handler;
    },
  };

  return {
    matchMedia: () => mediaQuery,
    emitThemeChange(matches) {
      mediaQuery.matches = matches;
      changeHandler?.({ matches });
    },
  };
}

function createToggleMock() {
  let changeHandler = null;
  return {
    checked: false,
    addEventListener: (event, handler) => {
      if (event === "change") changeHandler = handler;
    },
    emitChange() {
      changeHandler?.();
    },
  };
}

test("system theme follows the dark-mode media query", () => {
  assert.equal(getSystemTheme(createWindowMock(true)), "dark");
  assert.equal(getSystemTheme(createWindowMock(false)), "light");
});

test("theme controller applies and persists manual changes", () => {
  const attributes = new Map();
  const savedThemes = [];
  const toggle = createToggleMock();
  const controller = createThemeController({
    documentLike: {
      documentElement: {
        setAttribute: (name, value) => attributes.set(name, value),
      },
    },
    windowLike: createWindowMock(false),
    toggle,
    getSavedTheme: () => null,
    saveTheme: (theme) => savedThemes.push(theme),
  });

  controller.init();
  assert.equal(attributes.get("data-theme"), "light");

  toggle.checked = true;
  toggle.emitChange();
  assert.equal(attributes.get("data-theme"), "dark");
  assert.deepEqual(savedThemes, ["dark"]);
});

test("theme controller follows system changes only without a saved preference", () => {
  const attributes = new Map();
  const windowLike = createWindowMock(false);
  let savedTheme = null;
  const controller = createThemeController({
    documentLike: {
      documentElement: {
        setAttribute: (name, value) => attributes.set(name, value),
      },
    },
    windowLike,
    toggle: createToggleMock(),
    getSavedTheme: () => savedTheme,
    saveTheme: (theme) => {
      savedTheme = theme;
    },
  });

  controller.init();
  windowLike.emitThemeChange(true);
  assert.equal(attributes.get("data-theme"), "dark");

  savedTheme = "dark";
  windowLike.emitThemeChange(false);
  assert.equal(attributes.get("data-theme"), "dark");
});
