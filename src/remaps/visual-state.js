import { isModifierActive } from "../keyboard/prefixes.js";

function selectionContainsKey(
  { modifiers, key },
  buttonKey,
  modifierBase,
  distinguishSides
) {
  if (modifierBase) {
    return isModifierActive(
      buttonKey,
      modifierBase,
      modifiers,
      distinguishSides
    );
  }
  return key === buttonKey;
}

export function getRemapKeyVisualState({
  buttonKey,
  modifierBase = null,
  activeSelection,
  inactiveSelection,
  distinguishSides,
}) {
  return {
    active: selectionContainsKey(
      activeSelection,
      buttonKey,
      modifierBase,
      distinguishSides
    ),
    ghost: selectionContainsKey(
      inactiveSelection,
      buttonKey,
      modifierBase,
      distinguishSides
    ),
  };
}
