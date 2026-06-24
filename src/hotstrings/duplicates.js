function normalizeTrigger(trigger, caseSensitive) {
  return caseSensitive ? trigger : trigger.toLowerCase();
}

export function areHotstringsDuplicate(first, second) {
  if (first.caseSensitive !== second.caseSensitive) {
    return false;
  }

  return (
    normalizeTrigger(first.trigger, first.caseSensitive) ===
    normalizeTrigger(second.trigger, second.caseSensitive)
  );
}

export function findDuplicateHotstringIndex(hotstrings, candidate) {
  return hotstrings.findIndex((hotstring) =>
    areHotstringsDuplicate(hotstring, candidate)
  );
}
