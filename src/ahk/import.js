import { findDuplicateHotstringIndex } from "../hotstrings/duplicates.js";

export function mergeParsedEntries(target, parsed) {
  const summary = {
    added: {
      hotkeys: 0,
      hotstrings: 0,
      remaps: 0,
    },
    duplicates: {
      hotkeys: 0,
      hotstrings: 0,
      remaps: 0,
    },
  };

  mergeUnique(
    target.hotkeys,
    parsed.hotkeys,
    (entries, candidate) =>
      entries.some((entry) => entry.prefix === candidate.prefix),
    summary,
    "hotkeys"
  );
  mergeUnique(
    target.hotstrings,
    parsed.hotstrings,
    (entries, candidate) =>
      findDuplicateHotstringIndex(entries, candidate) !== -1,
    summary,
    "hotstrings"
  );
  mergeUnique(
    target.remaps,
    parsed.remaps,
    (entries, candidate) =>
      entries.some((entry) => entry.fromPrefix === candidate.fromPrefix),
    summary,
    "remaps"
  );

  return summary;
}

function mergeUnique(target, candidates, isDuplicate, summary, type) {
  for (const candidate of candidates) {
    if (isDuplicate(target, candidate)) {
      summary.duplicates[type]++;
    } else {
      target.push(candidate);
      summary.added[type]++;
    }
  }
}

export function getImportStatus(summary, skippedCount, t) {
  const parts = [];
  if (summary.added.hotkeys > 0) {
    parts.push(t("count.hotkeys", { count: summary.added.hotkeys }));
  }
  if (summary.added.hotstrings > 0) {
    parts.push(t("count.hotstrings", { count: summary.added.hotstrings }));
  }
  if (summary.added.remaps > 0) {
    parts.push(t("count.remaps", { count: summary.added.remaps }));
  }

  let message =
    parts.length > 0
      ? t("status.loaded", { parts: parts.join(", ") })
      : t("status.noNewEntries");

  if (skippedCount > 0) {
    message += t("status.skipped", { count: skippedCount });
  }

  const duplicateCount = Object.values(summary.duplicates).reduce(
    (total, count) => total + count,
    0
  );
  if (duplicateCount > 0) {
    message += t("status.duplicates", { count: duplicateCount });
  }

  return message;
}
