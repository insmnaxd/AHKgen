const MODIFIER_SYMBOLS = {
  Ctrl: "^",
  Alt: "!",
  Shift: "+",
  Win: "#",
};

const SIDE_MODIFIER_SYMBOLS = {
  LCtrl: "<^",
  RCtrl: ">^",
  LAlt: "!",
  RAlt: "!",
  LShift: "<+",
  RShift: ">+",
  LWin: "<#",
  RWin: ">#",
  AltGr: "<^>!",
};

const SIDE_KEY_TO_GENERIC = {
  LCtrl: "Ctrl",
  RCtrl: "Ctrl",
  LAlt: "Alt",
  RAlt: "Alt",
  LShift: "Shift",
  RShift: "Shift",
  LWin: "Win",
  RWin: "Win",
  AltGr: "AltGr",
};

const ALL_MODIFIER_KEYS = [
  "LCtrl",
  "RCtrl",
  "LAlt",
  "RAlt",
  "LShift",
  "RShift",
  "LWin",
  "RWin",
  "AltGr",
];

// Longest symbols must be checked first.
const PREFIX_SYMBOL_TABLE = [
  ["<^>!", "AltGr"],
  ["<^", "LCtrl"],
  [">^", "RCtrl"],
  ["<!", "LAlt"],
  [">!", "RAlt"],
  ["<+", "LShift"],
  [">+", "RShift"],
  ["<#", "LWin"],
  [">#", "RWin"],
  ["^", "LCtrl"],
  ["!", "LAlt"],
  ["+", "LShift"],
  ["#", "LWin"],
];

export function getModifierBase(modifierKey) {
  return SIDE_KEY_TO_GENERIC[modifierKey] || modifierKey;
}

export function buildPrefix(modifiers, key, distinguishSides = false) {
  let prefix = "";

  if (distinguishSides) {
    const appendedSymbols = new Set();
    for (const modifierKey of ALL_MODIFIER_KEYS) {
      const symbol = SIDE_MODIFIER_SYMBOLS[modifierKey];
      if (modifiers.has(modifierKey) && !appendedSymbols.has(symbol)) {
        prefix += symbol;
        appendedSymbols.add(symbol);
      }
    }
  } else {
    const genericModifiers = new Set();
    modifiers.forEach((modifierKey) => {
      if (modifierKey !== "AltGr") {
        genericModifiers.add(getModifierBase(modifierKey));
      }
    });

    if (genericModifiers.has("Ctrl")) prefix += MODIFIER_SYMBOLS.Ctrl;
    if (genericModifiers.has("Alt")) prefix += MODIFIER_SYMBOLS.Alt;
    if (genericModifiers.has("Shift")) prefix += MODIFIER_SYMBOLS.Shift;
    if (genericModifiers.has("Win")) prefix += MODIFIER_SYMBOLS.Win;
    if (modifiers.has("AltGr")) prefix += SIDE_MODIFIER_SYMBOLS.AltGr;
  }

  return prefix + (key || "");
}

export function parsePrefix(prefix) {
  const modifiers = new Set();
  let rest = prefix;

  let matched = true;
  while (matched) {
    matched = false;
    for (const [symbol, modifierKey] of PREFIX_SYMBOL_TABLE) {
      if (rest.startsWith(symbol)) {
        modifiers.add(modifierKey);
        rest = rest.slice(symbol.length);
        matched = true;
        break;
      }
    }
  }

  return { mods: modifiers, key: rest };
}

export function toggleModifierInSet(modifiers, modifierKey, distinguishSides = false) {
  const base = getModifierBase(modifierKey);

  if (distinguishSides || base === "AltGr") {
    if (modifiers.has(modifierKey)) {
      modifiers.delete(modifierKey);
    } else {
      modifiers.add(modifierKey);
    }
    return;
  }

  const familyKeys = ALL_MODIFIER_KEYS.filter((key) => getModifierBase(key) === base);
  const familyIsActive = familyKeys.some((key) => modifiers.has(key));

  if (familyIsActive) {
    familyKeys.forEach((key) => modifiers.delete(key));
  } else {
    modifiers.add(modifierKey);
  }
}

export function isModifierActive(modifierKey, base, modifiers, distinguishSides = false) {
  if (distinguishSides || base === "AltGr") {
    return modifiers.has(modifierKey);
  }

  return [...modifiers].some((selected) => getModifierBase(selected) === base);
}
