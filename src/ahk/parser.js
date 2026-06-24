import { AHKGEN_SIGNATURE_PREFIX } from "./constants.js";
import { unescapeFromRun, unescapeFromSend, unescapeHotstringTrigger } from "./escaping.js";

export function parseHotstringDefinition(line) {
  if (!line.startsWith(":")) return null;

  const optionsEnd = line.indexOf(":", 1);
  if (optionsEnd === -1) return null;

  const options = line.slice(1, optionsEnd);
  const triggerStart = optionsEnd + 1;

  for (let i = triggerStart; i < line.length - 1; i++) {
    if (line[i] === "`") {
      i += 1;
      continue;
    }
    if (line[i] === ":" && line[i + 1] === ":") {
      const encodedTrigger = line.slice(triggerStart, i);
      if (!encodedTrigger) return null;

      return {
        options,
        trigger: unescapeHotstringTrigger(encodedTrigger),
        replacement: line.slice(i + 2).replace(/([ \t])`$/, "$1"),
      };
    }
  }

  return null;
}

export function parseActionLine(line) {
  const commandLine = line.trimStart();

  // Consume at most one separator space after the comma. Any additional
  // whitespace belongs to the text being sent.
  const sendMatch = commandLine.match(/^Send,[ \t]?(.*)$/i);
  if (sendMatch) {
    return { actionType: "send", actionValue: unescapeFromSend(sendMatch[1]) };
  }

  const runMatch = commandLine.trimEnd().match(/^Run,\s*(.*)$/i);
  if (runMatch) {
    const raw = runMatch[1];
    const isQuoted = raw.trim().startsWith('"') && raw.trim().endsWith('"');
    if (!isQuoted) {
      return { actionType: "command", actionValue: raw.trim() };
    }

    const unescaped = unescapeFromRun(raw);
    return {
      actionType: /^https?:\/\//i.test(unescaped) ? "url" : "run",
      actionValue: unescaped,
    };
  }

  return null;
}

export function parseAhkScript(rawText) {
  const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
  const lines = text.split(/\r\n|\r|\n/);
  const headerLines = lines.slice(0, 5);
  const hasSignature = headerLines.some((line) => line.trim().startsWith(AHKGEN_SIGNATURE_PREFIX));

  if (!hasSignature) {
    return {
      success: false,
      errorKey: "error.missingSignature",
    };
  }

  const hotkeys = [];
  const remaps = [];
  const hotstrings = [];
  let skippedCount = 0;

  function getPrecedingComment(index) {
    if (index <= 0) return "";
    const previous = lines[index - 1].trim();
    if (
      previous.startsWith(";") &&
      !previous.startsWith(AHKGEN_SIGNATURE_PREFIX) &&
      previous !== "; AutoHotkey v1" &&
      previous !== "; --- Hotkeys ---" &&
      previous !== "; --- Hotstrings ---" &&
      previous !== "; --- Key remaps ---"
    ) {
      return previous.slice(1).trim();
    }
    return "";
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const hotstringDefinition = parseHotstringDefinition(line.trimStart());
    const remapMatch = trimmed.match(/^(.+)::(.+)$/);
    const hotkeyMatch = trimmed.match(/^(.+)::$/);

    if (hotstringDefinition) {
      const { options, trigger, replacement } = hotstringDefinition;
      hotstrings.push({
        trigger,
        replacement,
        autoReplace: options.includes("*"),
        caseSensitive: options.includes("C"),
        insideWord: options.includes("?"),
        rawText: options.includes("R"),
        comment: getPrecedingComment(i),
      });
      i += 1;
      continue;
    }

    if (hotkeyMatch) {
      const prefix = hotkeyMatch[1];
      let cursor = i + 1;
      let sendMode = "Input";
      const sendModeMatch = (lines[cursor] || "").trim().match(/^SendMode,\s*(\w+)$/i);
      if (sendModeMatch) {
        sendMode = sendModeMatch[1];
        cursor += 1;
      }

      const parsedAction = parseActionLine(lines[cursor] || "");
      const returnLine = (lines[cursor + 1] || "").trim();
      if (parsedAction && returnLine.toLowerCase() === "return") {
        hotkeys.push({
          prefix,
          actionType: parsedAction.actionType,
          actionValue: parsedAction.actionValue,
          sendMode: parsedAction.actionType === "send" ? sendMode : "Input",
          comment: getPrecedingComment(i),
        });
        i = cursor + 2;
        continue;
      }

      skippedCount += 1;
      i += 1;
      continue;
    }

    if (remapMatch) {
      remaps.push({
        fromPrefix: remapMatch[1],
        toPrefix: remapMatch[2],
        comment: getPrecedingComment(i),
      });
      i += 1;
      continue;
    }

    i += 1;
  }

  return { success: true, hotkeys, remaps, hotstrings, skippedCount };
}
