import assert from "node:assert/strict";
import test from "node:test";

import {
  createInputCapture,
  keyboardCodeToAhkKey,
  keyboardCodeToModifier,
  mouseButtonToAhkKey,
  wheelEventToAhkKey,
} from "../src/input/capture.js";

function createCaptureHarness() {
  const documentListeners = new Map();
  const elementListeners = new Map();
  const classes = new Set();
  let blurCount = 0;
  const documentLike = {
    addEventListener: (type, handler) => documentListeners.set(type, handler),
  };
  const element = {
    addEventListener: (type, handler) => elementListeners.set(type, handler),
    blur: () => {
      blurCount += 1;
    },
    contains: (target) => target === element,
    classList: {
      toggle: (name, enabled) =>
        enabled ? classes.add(name) : classes.delete(name),
    },
  };
  const dispatch = (type, properties = {}) => {
    const event = {
      target: properties.target || {},
      code: "",
      button: 0,
      deltaX: 0,
      deltaY: 0,
      repeat: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      getModifierState: () => false,
      preventDefault() {},
      stopImmediatePropagation() {},
      ...properties,
    };
    documentListeners.get(type)?.(event);
  };

  return {
    documentLike,
    element,
    classes,
    clickElement: () => elementListeners.get("click")?.({ target: element }),
    mouseDownElement: () => {
      let prevented = false;
      elementListeners.get("mousedown")?.({
        target: element,
        preventDefault: () => {
          prevented = true;
        },
      });
      return prevented;
    },
    getBlurCount: () => blurCount,
    dispatch,
  };
}

test("keyboard codes map to AHK key names", () => {
  assert.equal(keyboardCodeToAhkKey("KeyA"), "a");
  assert.equal(keyboardCodeToAhkKey("KeyA", { a: "q" }), "q");
  assert.equal(keyboardCodeToAhkKey("Digit7"), "7");
  assert.equal(keyboardCodeToAhkKey("F12"), "F12");
  assert.equal(keyboardCodeToAhkKey("ArrowLeft"), "Left");
  assert.equal(keyboardCodeToAhkKey("PageDown"), "PgDn");
  assert.equal(keyboardCodeToAhkKey("ContextMenu"), "AppsKey");
  assert.equal(keyboardCodeToAhkKey("NumpadAdd"), "NumpadAdd");
  assert.equal(keyboardCodeToAhkKey("Unknown"), null);
});

test("modifier codes preserve left and right sides", () => {
  const event = { getModifierState: () => false };

  assert.equal(keyboardCodeToModifier("ControlLeft", event), "LCtrl");
  assert.equal(keyboardCodeToModifier("ControlRight", event), "RCtrl");
  assert.equal(keyboardCodeToModifier("ShiftLeft", event), "LShift");
  assert.equal(keyboardCodeToModifier("MetaRight", event), "RWin");
});

test("AltGraph is captured as AltGr", () => {
  assert.equal(
    keyboardCodeToModifier("AltRight", {
      getModifierState: (name) => name === "AltGraph",
    }),
    "AltGr"
  );
});

test("mouse buttons map to AHK mouse key names", () => {
  assert.equal(mouseButtonToAhkKey(0), "LButton");
  assert.equal(mouseButtonToAhkKey(1), "MButton");
  assert.equal(mouseButtonToAhkKey(2), "RButton");
  assert.equal(mouseButtonToAhkKey(3), "XButton1");
  assert.equal(mouseButtonToAhkKey(4), "XButton2");
  assert.equal(mouseButtonToAhkKey(5), null);
});

test("mouse wheel direction maps to AHK wheel names", () => {
  assert.equal(wheelEventToAhkKey({ deltaX: 0, deltaY: -1 }), "WheelUp");
  assert.equal(wheelEventToAhkKey({ deltaX: 0, deltaY: 1 }), "WheelDown");
  assert.equal(wheelEventToAhkKey({ deltaX: -2, deltaY: 1 }), "WheelLeft");
  assert.equal(wheelEventToAhkKey({ deltaX: 2, deltaY: 1 }), "WheelRight");
});

test("capture only includes modifiers held with the final key", () => {
  const harness = createCaptureHarness();
  const captured = [];
  const progress = [];
  const capture = createInputCapture({ documentLike: harness.documentLike });
  capture.register(harness.element, {
    onCapture: (value) => captured.push(value),
    onProgress: (value) => progress.push(value),
  });
  capture.init();

  harness.clickElement();
  harness.dispatch("keydown", { code: "ControlLeft" });
  harness.dispatch("keyup", { code: "ControlLeft" });
  harness.dispatch("keydown", { code: "KeyJ" });

  assert.deepEqual(captured, [
    {
      modifiers: new Set(),
      key: "j",
    },
  ]);
  assert.deepEqual(progress.at(-1), {
    modifiers: new Set(),
  });
  assert.equal(capture.isCapturing(), false);
});

test("held modifiers are included with the final key", () => {
  const harness = createCaptureHarness();
  const captured = [];
  const capture = createInputCapture({ documentLike: harness.documentLike });
  capture.register(harness.element, {
    onCapture: (value) => captured.push(value),
  });
  capture.init();

  harness.clickElement();
  harness.dispatch("keydown", { code: "ControlLeft" });
  harness.dispatch("keydown", { code: "KeyJ" });

  assert.deepEqual(captured, [
    {
      modifiers: new Set(["LCtrl"]),
      key: "j",
    },
  ]);
});

test("AltGr is released when AltRight keyup no longer reports AltGraph", () => {
  const harness = createCaptureHarness();
  const captured = [];
  const progress = [];
  const capture = createInputCapture({ documentLike: harness.documentLike });
  capture.register(harness.element, {
    onCapture: (value) => captured.push(value),
    onProgress: (value) => progress.push(value),
  });
  capture.init();

  harness.clickElement();
  harness.dispatch("keydown", {
    code: "AltRight",
    getModifierState: (name) => name === "AltGraph",
  });
  harness.dispatch("keyup", {
    code: "AltRight",
    getModifierState: () => false,
  });
  harness.dispatch("keydown", { code: "KeyJ" });

  assert.deepEqual(progress.at(-1), {
    modifiers: new Set(),
  });
  assert.deepEqual(captured, [
    {
      modifiers: new Set(),
      key: "j",
    },
  ]);
});

test("capture accepts mouse buttons inside the armed field", () => {
  const harness = createCaptureHarness();
  const captured = [];
  const capture = createInputCapture({ documentLike: harness.documentLike });
  capture.register(harness.element, {
    onCapture: (value) => captured.push(value),
  });
  capture.init();

  harness.clickElement();
  harness.dispatch("mousedown", { button: 2, target: harness.element });

  assert.deepEqual(captured, [
    {
      modifiers: new Set(),
      key: "RButton",
    },
  ]);
});

test("clicking outside the armed field cancels capture", () => {
  const harness = createCaptureHarness();
  let starts = 0;
  let cancellations = 0;
  const capture = createInputCapture({ documentLike: harness.documentLike });
  capture.register(harness.element, {
    onStart: () => {
      starts += 1;
    },
    onCancel: () => {
      cancellations += 1;
    },
    onCapture() {},
  });
  capture.init();

  harness.clickElement();
  assert.equal(capture.isCapturing(), true);
  assert.equal(starts, 1);
  harness.dispatch("click", { target: {} });
  assert.equal(capture.isCapturing(), false);
  assert.equal(cancellations, 1);
});

test("arming a field starts from an empty modifier preview", () => {
  const harness = createCaptureHarness();
  const events = [];
  const capture = createInputCapture({ documentLike: harness.documentLike });
  capture.register(harness.element, {
    onStart: () => events.push("start"),
    onProgress: ({ modifiers }) =>
      events.push(`progress:${modifiers.size}`),
    onCapture() {},
  });
  capture.init();

  harness.clickElement();

  assert.deepEqual(events, ["start", "progress:0"]);
});

test("capture fields do not keep native focus", () => {
  const harness = createCaptureHarness();
  const capture = createInputCapture({ documentLike: harness.documentLike });
  capture.register(harness.element, {
    onCapture() {},
  });
  capture.init();

  assert.equal(harness.mouseDownElement(), true);
  harness.clickElement();
  harness.dispatch("keydown", { code: "KeyJ" });

  assert.equal(harness.getBlurCount(), 1);
  assert.equal(capture.isCapturing(), false);
});

test("switching capture fields preserves the previous field", () => {
  const documentListeners = new Map();
  const documentLike = {
    addEventListener: (type, handler) => documentListeners.set(type, handler),
  };
  const createElement = () => {
    const listeners = new Map();
    const classes = new Set();
    const element = {
      addEventListener: (type, handler) => listeners.set(type, handler),
      blur() {},
      contains: (target) => target === element,
      classList: {
        toggle: (name, enabled) =>
          enabled ? classes.add(name) : classes.delete(name),
      },
    };
    return {
      element,
      classes,
      click: () => listeners.get("click")?.({ target: element }),
    };
  };
  const first = createElement();
  const second = createElement();
  let firstCancellations = 0;
  const capture = createInputCapture({ documentLike });

  capture.register(first.element, {
    onCancel: () => {
      firstCancellations += 1;
    },
  });
  capture.register(second.element, {});
  capture.init();

  first.click();
  second.click();

  assert.equal(firstCancellations, 0);
  assert.equal(first.classes.has("capturing-input"), false);
  assert.equal(second.classes.has("capturing-input"), true);
});

test("completed capture can hand off directly to the next field", () => {
  const documentListeners = new Map();
  const documentLike = {
    addEventListener: (type, handler) => documentListeners.set(type, handler),
  };
  const createElement = () => {
    const listeners = new Map();
    const classes = new Set();
    const element = {
      addEventListener: (type, handler) => listeners.set(type, handler),
      blur() {},
      contains: (target) => target === element,
      classList: {
        toggle: (name, enabled) =>
          enabled ? classes.add(name) : classes.delete(name),
      },
    };
    return {
      element,
      classes,
      click: () => listeners.get("click")?.({ target: element }),
    };
  };
  const first = createElement();
  const second = createElement();
  const capture = createInputCapture({ documentLike });
  let secondControl;

  capture.register(first.element, {
    onCapture() {},
    onComplete: () => secondControl.start(),
  });
  secondControl = capture.register(second.element, {});
  capture.init();

  first.click();
  documentListeners.get("keydown")({
    code: "KeyJ",
    repeat: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    getModifierState: () => false,
    preventDefault() {},
    stopImmediatePropagation() {},
  });

  assert.equal(capture.isCapturing(), true);
  assert.equal(first.classes.has("capturing-input"), false);
  assert.equal(second.classes.has("capturing-input"), true);
});

test("native key events behave like captured modifiers", () => {
  const harness = createCaptureHarness();
  const progress = [];
  const nativeCaptureStates = [];
  const capture = createInputCapture({
    documentLike: harness.documentLike,
    setNativeCaptureEnabled: (enabled) =>
      nativeCaptureStates.push(enabled),
  });
  capture.register(harness.element, {
    onProgress: ({ modifiers }) => progress.push(modifiers),
  });
  capture.init();

  harness.clickElement();
  capture.handleNativeKey({ code: "MetaLeft", pressed: true });
  capture.handleNativeKey({ code: "MetaLeft", pressed: false });
  capture.stop();

  assert.deepEqual(progress.at(-1), new Set());
  assert.deepEqual(nativeCaptureStates, [true, false]);
});

test("native key events can complete system-level shortcuts", () => {
  const harness = createCaptureHarness();
  const captured = [];
  const capture = createInputCapture({
    documentLike: harness.documentLike,
  });
  capture.register(harness.element, {
    onCapture: (value) => captured.push(value),
  });
  capture.init();

  harness.clickElement();
  capture.handleNativeKey({ code: "MetaLeft", pressed: true });
  capture.handleNativeKey({ code: "KeyR", pressed: true });

  assert.deepEqual(captured, [
    {
      modifiers: new Set(["LWin"]),
      key: "r",
    },
  ]);
  assert.equal(capture.isCapturing(), false);
});

test("capture waits for native key blocking before it becomes active", async () => {
  const harness = createCaptureHarness();
  let resolveNativeReady;
  const nativeReady = new Promise((resolve) => {
    resolveNativeReady = resolve;
  });
  const capture = createInputCapture({
    documentLike: harness.documentLike,
    setNativeCaptureEnabled: () => nativeReady,
  });
  capture.register(harness.element, {});
  capture.init();

  harness.clickElement();

  assert.equal(capture.isCapturing(), false);
  assert.equal(harness.classes.has("capturing-input"), false);

  resolveNativeReady();
  await Promise.resolve();

  assert.equal(capture.isCapturing(), true);
  assert.equal(harness.classes.has("capturing-input"), true);
});
