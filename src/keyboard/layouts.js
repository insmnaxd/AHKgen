export const KEYBOARD_LAYOUT_MAPS = {
  qwerty: {},
  qwertz: { z: "y", y: "z" },
  azerty: { a: "q", q: "a", z: "w", w: "z" },
};

export function isSupportedKeyboardLayout(layout) {
  return Object.prototype.hasOwnProperty.call(KEYBOARD_LAYOUT_MAPS, layout);
}

export function getKeyboardLayoutMap(layout) {
  return KEYBOARD_LAYOUT_MAPS[layout] || KEYBOARD_LAYOUT_MAPS.qwerty;
}
