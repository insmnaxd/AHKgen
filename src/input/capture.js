const MODIFIER_CODES = {
  ControlLeft: "LCtrl",
  ControlRight: "RCtrl",
  AltLeft: "LAlt",
  AltRight: "RAlt",
  ShiftLeft: "LShift",
  ShiftRight: "RShift",
  MetaLeft: "LWin",
  MetaRight: "RWin",
};

const KEY_CODES = {
  Escape: "Escape",
  Tab: "Tab",
  CapsLock: "CapsLock",
  Enter: "Enter",
  Space: "Space",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PgUp",
  PageDown: "PgDn",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  PrintScreen: "PrintScreen",
  ScrollLock: "ScrollLock",
  Pause: "Pause",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Numpad0: "Numpad0",
  Numpad1: "Numpad1",
  Numpad2: "Numpad2",
  Numpad3: "Numpad3",
  Numpad4: "Numpad4",
  Numpad5: "Numpad5",
  Numpad6: "Numpad6",
  Numpad7: "Numpad7",
  Numpad8: "Numpad8",
  Numpad9: "Numpad9",
  NumpadDecimal: "NumpadDot",
  NumpadAdd: "NumpadAdd",
  NumpadSubtract: "NumpadSub",
  NumpadMultiply: "NumpadMult",
  NumpadDivide: "NumpadDiv",
  NumpadEnter: "NumpadEnter",
};

const MOUSE_BUTTONS = {
  0: "LButton",
  1: "MButton",
  2: "RButton",
  3: "XButton1",
  4: "XButton2",
};

export function keyboardCodeToAhkKey(code, layoutMap = {}) {
  if (/^Key[A-Z]$/.test(code)) {
    const baseKey = code.slice(3).toLowerCase();
    return layoutMap[baseKey] || baseKey;
  }
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return KEY_CODES[code] || null;
}

export function keyboardCodeToModifier(code, event) {
  if (code === "AltRight" && event.getModifierState?.("AltGraph")) {
    return "AltGr";
  }
  return MODIFIER_CODES[code] || null;
}

export function mouseButtonToAhkKey(button) {
  return MOUSE_BUTTONS[button] || null;
}

export function wheelEventToAhkKey(event) {
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    return event.deltaX < 0 ? "WheelLeft" : "WheelRight";
  }
  if (event.deltaY === 0) return null;
  return event.deltaY < 0 ? "WheelUp" : "WheelDown";
}

function addFallbackModifiers(modifiers, event) {
  if (
    event.ctrlKey &&
    !modifiers.has("AltGr") &&
    ![...modifiers].some((key) => key.endsWith("Ctrl"))
  ) {
    modifiers.add("LCtrl");
  }
  if (
    event.altKey &&
    !modifiers.has("AltGr") &&
    ![...modifiers].some((key) => key.endsWith("Alt"))
  ) {
    modifiers.add("LAlt");
  }
  if (event.shiftKey && ![...modifiers].some((key) => key.endsWith("Shift"))) {
    modifiers.add("LShift");
  }
  if (event.metaKey && ![...modifiers].some((key) => key.endsWith("Win"))) {
    modifiers.add("LWin");
  }
}

export function createInputCapture({
  documentLike,
  setNativeCaptureEnabled = () => {},
}) {
  const registrations = new Map();
  const selectedModifiers = new Set();
  let activeElement = null;
  let suppressNextClick = false;

  function isCaptureTrigger(target) {
    return [...registrations.keys()].some(
      (element) => element === target || element.contains?.(target)
    );
  }

  function updateCaptureClass() {
    registrations.forEach((_, element) => {
      element.classList.toggle("capturing-input", element === activeElement);
    });
  }

  function stop(completed = false) {
    if (!activeElement) return;
    const element = activeElement;
    const registration = registrations.get(element);
    activeElement = null;
    setNativeCaptureEnabled(false);
    selectedModifiers.clear();
    updateCaptureClass();
    element.blur?.();
    if (!completed) registration?.onCancel?.();
    registration?.onStateChange?.(false);
  }

  function start(element) {
    if (activeElement === element) {
      stop();
      return;
    }

    if (activeElement) stop(true);
    activeElement = element;
    setNativeCaptureEnabled(true);
    selectedModifiers.clear();
    updateCaptureClass();
    const registration = registrations.get(element);
    registration?.onStart?.();
    registration?.onStateChange?.(true);
    registration?.onProgress?.({ modifiers: new Set() });
  }

  function finish(key, event) {
    if (!activeElement || !key) return;
    const registration = registrations.get(activeElement);
    const modifiers = new Set(selectedModifiers);
    addFallbackModifiers(modifiers, event);
    registration.onCapture({ modifiers, key });
    stop(true);
    registration.onComplete?.();
  }

  function handleKeydown(event) {
    if (!activeElement || event.repeat) return;

    const modifier = keyboardCodeToModifier(event.code, event);
    if (modifier) {
      if (modifier === "AltGr") {
        selectedModifiers.delete("LCtrl");
        selectedModifiers.delete("RCtrl");
        selectedModifiers.delete("LAlt");
        selectedModifiers.delete("RAlt");
      }
      if (selectedModifiers.has(modifier)) {
        selectedModifiers.delete(modifier);
      } else {
        selectedModifiers.add(modifier);
      }
      registrations
        .get(activeElement)
        ?.onProgress?.({ modifiers: new Set(selectedModifiers) });
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const registration = registrations.get(activeElement);
    const key = keyboardCodeToAhkKey(
      event.code,
      registration.getLayoutMap?.() || {}
    );
    if (!key) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    finish(key, event);
  }

  function handleKeyup(event) {
    if (!activeElement || !keyboardCodeToModifier(event.code, event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function handleNativeModifier({ code, pressed }) {
    if (!activeElement || !pressed) return;
    const modifier = keyboardCodeToModifier(code, {
      getModifierState: () => false,
    });
    if (!modifier) return;

    if (selectedModifiers.has(modifier)) {
      selectedModifiers.delete(modifier);
    } else {
      selectedModifiers.add(modifier);
    }
    registrations
      .get(activeElement)
      ?.onProgress?.({ modifiers: new Set(selectedModifiers) });
  }

  function handleMouseDown(event) {
    if (
      !activeElement ||
      (event.target !== activeElement && !activeElement.contains?.(event.target))
    ) {
      return;
    }
    const key = mouseButtonToAhkKey(event.button);
    if (!key) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    suppressNextClick = true;
    finish(key, event);
  }

  function handleWheel(event) {
    if (
      !activeElement ||
      (event.target !== activeElement && !activeElement.contains?.(event.target))
    ) {
      return;
    }
    const key = wheelEventToAhkKey(event);
    if (!key) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    finish(key, event);
  }

  function handleClick(event) {
    if (suppressNextClick) {
      suppressNextClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (activeElement && !isCaptureTrigger(event.target)) {
      stop();
    }
  }

  function handleContextMenu(event) {
    if (!activeElement && !suppressNextClick) return;
    event.preventDefault();
    suppressNextClick = false;
  }

  function register(element, options) {
    registrations.set(element, options);
    element.addEventListener("mousedown", (event) => {
      if (!activeElement) {
        setNativeCaptureEnabled(true);
        event.preventDefault();
      }
    });
    element.addEventListener("click", () => start(element));

    return {
      start: () => start(element),
      stop,
      unregister: () => {
        if (activeElement === element) stop();
        registrations.delete(element);
      },
    };
  }

  function init() {
    documentLike.addEventListener("keydown", handleKeydown, true);
    documentLike.addEventListener("keyup", handleKeyup, true);
    documentLike.addEventListener("mousedown", handleMouseDown, true);
    documentLike.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false,
    });
    documentLike.addEventListener("click", handleClick, true);
    documentLike.addEventListener("contextmenu", handleContextMenu, true);
    documentLike.defaultView?.addEventListener("blur", () => stop());
  }

  return {
    init,
    register,
    stop,
    handleNativeModifier,
    isCapturing: () => activeElement !== null,
  };
}
