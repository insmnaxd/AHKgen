const key = (keyName, label, options = {}) => ({
  key: keyName,
  label,
  ...options,
});

const spacer = (span = 1) => ({ spacer: true, span });

export const STANDARD_KEYBOARD_LAYOUT = {
  functionRow: {
    main: {
      columns: 16,
      rows: [
        [
          key("Escape", "Esc"),
          spacer(),
          key("F1", "F1"),
          key("F2", "F2"),
          key("F3", "F3"),
          key("F4", "F4"),
          spacer(),
          key("F5", "F5"),
          key("F6", "F6"),
          key("F7", "F7"),
          key("F8", "F8"),
          spacer(),
          key("F9", "F9"),
          key("F10", "F10"),
          key("F11", "F11"),
          key("F12", "F12"),
        ],
      ],
    },
    system: {
      columns: 3,
      rows: [
        [
          key("PrintScreen", "PrtSc", { title: "Print Screen" }),
          key("ScrollLock", "ScrLk", { title: "Scroll Lock" }),
          key("Pause", "Pause"),
        ],
      ],
    },
  },
  main: {
    columns: 30,
    rows: [
      [
        key("`", "`", { span: 2 }),
        ..."1234567890".split("").map((value) => key(value, value, { span: 2 })),
        key("-", "-", { span: 2 }),
        key("=", "=", { span: 2 }),
        key("Backspace", "Backspace", { span: 4, className: "kb-key-text" }),
      ],
      [
        key("Tab", "Tab", { span: 3 }),
        ..."qwertyuiop".split("").map((value) =>
          key(value, value.toUpperCase(), { span: 2 })
        ),
        key("[", "[", { span: 2 }),
        key("]", "]", { span: 2 }),
        key("\\", "\\", { span: 3 }),
      ],
      [
        key("CapsLock", "Caps", { span: 4 }),
        ..."asdfghjkl".split("").map((value) =>
          key(value, value.toUpperCase(), { span: 2 })
        ),
        key(";", ";", { span: 2 }),
        key("'", "'", { span: 2 }),
        key("Enter", "Enter", { span: 4 }),
      ],
      [
        key("LShift", "Shift", {
          span: 5,
          modifier: true,
          side: "L",
          base: "Shift",
        }),
        ..."zxcvbnm".split("").map((value) =>
          key(value, value.toUpperCase(), { span: 2 })
        ),
        key(",", ",", { span: 2 }),
        key(".", ".", { span: 2 }),
        key("/", "/", { span: 2 }),
        key("RShift", "Shift", {
          span: 5,
          modifier: true,
          side: "R",
          base: "Shift",
        }),
      ],
      [
        key("LCtrl", "Ctrl", {
          span: 3,
          modifier: true,
          side: "L",
          base: "Ctrl",
        }),
        key("LWin", "Win", {
          span: 3,
          modifier: true,
          side: "L",
          base: "Win",
        }),
        key("LAlt", "Alt", {
          span: 3,
          modifier: true,
          side: "L",
          base: "Alt",
        }),
        key("Space", "Space", { span: 9 }),
        key("AltGr", "AltGr", {
          span: 3,
          modifier: true,
          side: "R",
          base: "AltGr",
        }),
        key("RWin", "Win", {
          span: 3,
          modifier: true,
          side: "R",
          base: "Win",
        }),
        key("AppsKey", "Menu", { span: 3 }),
        key("RCtrl", "Ctrl", {
          span: 3,
          modifier: true,
          side: "R",
          base: "Ctrl",
        }),
      ],
    ],
  },
  navigation: {
    columns: 6,
    rows: [
      [
        key("Insert", "Ins", { span: 2 }),
        key("Home", "Home", { span: 2 }),
        key("PgUp", "PgUp", { span: 2 }),
      ],
      [
        key("Delete", "Del", { span: 2 }),
        key("End", "End", { span: 2 }),
        key("PgDn", "PgDn", { span: 2 }),
      ],
      [spacer(6)],
      [spacer(2), key("Up", "↑", { span: 2 }), spacer(2)],
      [
        key("Left", "←", { span: 2 }),
        key("Down", "↓", { span: 2 }),
        key("Right", "→", { span: 2 }),
      ],
    ],
  },
  numpad: {
    columns: 8,
    keys: [
      key("NumLock", "Num", { column: 1, row: 1, span: 2 }),
      key("NumpadDiv", "/", { column: 3, row: 1, span: 2 }),
      key("NumpadMult", "*", { column: 5, row: 1, span: 2 }),
      key("NumpadSub", "-", { column: 7, row: 1, span: 2 }),
      key("Numpad7", "7", { column: 1, row: 2, span: 2 }),
      key("Numpad8", "8", { column: 3, row: 2, span: 2 }),
      key("Numpad9", "9", { column: 5, row: 2, span: 2 }),
      key("NumpadAdd", "+", {
        column: 7,
        row: 2,
        span: 2,
        rowSpan: 2,
      }),
      key("Numpad4", "4", { column: 1, row: 3, span: 2 }),
      key("Numpad5", "5", { column: 3, row: 3, span: 2 }),
      key("Numpad6", "6", { column: 5, row: 3, span: 2 }),
      key("Numpad1", "1", { column: 1, row: 4, span: 2 }),
      key("Numpad2", "2", { column: 3, row: 4, span: 2 }),
      key("Numpad3", "3", { column: 5, row: 4, span: 2 }),
      key("NumpadEnter", "Ent", {
        column: 7,
        row: 4,
        span: 2,
        rowSpan: 2,
        className: "kb-key-text",
        title: "Numpad Enter",
      }),
      key("Numpad0", "0", { column: 1, row: 5, span: 4 }),
      key("NumpadDot", ".", { column: 5, row: 5, span: 2 }),
    ],
  },
};

export const MOUSE_LAYOUT = [
  key("LButton", "Left", { area: "left", title: "Left button" }),
  key("RButton", "Right", { area: "right", title: "Right button" }),
  key("WheelUp", "↑", { area: "wheel-up", title: "Wheel up" }),
  key("MButton", "Wheel", { area: "wheel", title: "Middle button" }),
  key("WheelDown", "↓", { area: "wheel-down", title: "Wheel down" }),
  key("XButton1", "X1", { area: "x1", title: "Mouse button 4" }),
  key("XButton2", "X2", { area: "x2", title: "Mouse button 5" }),
  key("WheelLeft", "←", { area: "wheel-left", title: "Wheel left" }),
  key("WheelRight", "→", { area: "wheel-right", title: "Wheel right" }),
];
