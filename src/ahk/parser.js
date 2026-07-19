import { AHKFORGE_SIGNATURE_PREFIX } from "./constants.js";
import {
  unescapeFromExpressionString,
  unescapeFromRun,
  unescapeFromSend,
  unescapeFromV2Send,
  unescapeHotstringTrigger,
} from "./escaping.js";
import { AHK_VERSION_V2 } from "./versions.js";

const SUPPORTED_HOTSTRING_OPTIONS = /^[*C?R]*$/i;
const SUPPORTED_SEND_MODES = {
  input: "Input",
  event: "Event",
};

export function areHotstringOptionsSupported(options) {
  return SUPPORTED_HOTSTRING_OPTIONS.test(options);
}

export function normalizeSupportedSendMode(sendMode) {
  return SUPPORTED_SEND_MODES[sendMode.toLowerCase()] || null;
}

export function parseHotstringFunction(line) {
  const match = line.match(
    /^Hotstring\("((?:`.|""|[^"])*)", "((?:`.|""|[^"])*)"\)$/
  );
  if (!match) return null;

  const name = unescapeFromExpressionString(match[1]);
  const replacement = unescapeFromExpressionString(match[2]);
  let options = "";
  let trigger = "";

  if (name.startsWith("::")) {
    trigger = name.slice(2);
  } else {
    const optionsEnd = name.indexOf(":", 1);
    if (!name.startsWith(":") || optionsEnd === -1) return null;
    options = name.slice(1, optionsEnd);
    trigger = name.slice(optionsEnd + 1);
  }

  if (!trigger) return null;
  return { options, trigger, replacement };
}

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

export function parseActionLine(line, ahkVersion = "v1") {
  const commandLine = line.trimStart();

  if (ahkVersion === AHK_VERSION_V2) {
    const sendMatch = commandLine.trimEnd().match(
      /^(Send|SendInput|SendEvent)\("((?:`.|""|[^"])*)"\)$/i
    );
    if (sendMatch) {
      return {
        actionType: "send",
        actionValue: unescapeFromV2Send(sendMatch[2]),
        sendMode: sendMatch[1].toLowerCase() === "sendevent" ? "Event" : "Input",
      };
    }

    const runMatch = commandLine.trimEnd().match(/^Run\("((?:`.|""|[^"])*)"\)$/i);
    if (runMatch) {
      const actionValue = unescapeFromExpressionString(runMatch[1]);
      return {
        actionType: /^https?:\/\//i.test(actionValue) ? "url" : "run",
        actionValue,
      };
    }

    const commandMatch = commandLine.trimEnd().match(/^Run\s+"((?:`.|""|[^"])*)"$/i);
    if (commandMatch) {
      return {
        actionType: "command",
        actionValue: unescapeFromExpressionString(commandMatch[1]),
      };
    }

    return null;
  }

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
  const hasSignature = headerLines.some((line) =>
    line.trim().startsWith(AHKFORGE_SIGNATURE_PREFIX)
  );

  if (!hasSignature) {
    return {
      success: false,
      errorKey: "error.missingSignature",
    };
  }

  const ahkVersion = lines
    .slice(0, 8)
    .some((line) => /^(?:;\s*AutoHotkey\s+v2|#Requires\s+AutoHotkey\s+v2)/i.test(line.trim()))
    ? AHK_VERSION_V2
    : "v1";

  const hotkeys = [];
  const remaps = [];
  const hotstrings = [];
  let skippedCount = 0;

  function getPrecedingComment(index) {
    if (index <= 0) return "";
    const previous = lines[index - 1].trim();
    if (
      previous.startsWith(";") &&
      !previous.startsWith(AHKFORGE_SIGNATURE_PREFIX) &&
      previous !== "; AutoHotkey v1" &&
      previous !== "; AutoHotkey v2" &&
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
    const hotstringDefinition =
      parseHotstringFunction(trimmed) ||
      parseHotstringDefinition(line.trimStart());
    const remapMatch = trimmed.match(/^(.+)::(.+)$/);
    const hotkeyMatch = trimmed.match(/^(.+)::$/);

    if (hotstringDefinition) {
      const { options, trigger, replacement } = hotstringDefinition;
      if (!areHotstringOptionsSupported(options)) {
        skippedCount += 1;
        i += 1;
        continue;
      }

      const normalizedOptions = options.toUpperCase();
      hotstrings.push({
        trigger,
        replacement,
        autoReplace: normalizedOptions.includes("*"),
        caseSensitive: normalizedOptions.includes("C"),
        insideWord: normalizedOptions.includes("?"),
        rawText: normalizedOptions.includes("R"),
        comment: getPrecedingComment(i),
      });
      i += 1;
      continue;
    }

    if (hotkeyMatch) {
      const prefix = hotkeyMatch[1];
      let cursor = i + 1;

      if (ahkVersion === AHK_VERSION_V2) {
        const openingBrace = (lines[cursor] || "").trim();
        const parsedAction = parseActionLine(lines[cursor + 1] || "", ahkVersion);
        const closingBrace = (lines[cursor + 2] || "").trim();
        if (openingBrace === "{" && parsedAction && closingBrace === "}") {
          hotkeys.push({
            prefix,
            actionType: parsedAction.actionType,
            actionValue: parsedAction.actionValue,
            sendMode: parsedAction.actionType === "send" ? parsedAction.sendMode : "Input",
            comment: getPrecedingComment(i),
          });
          i = cursor + 3;
          continue;
        }

        skippedCount += 1;
        i += 1;
        continue;
      }

      let sendMode = "Input";
      const sendModeMatch = (lines[cursor] || "").trim().match(/^SendMode,\s*(\w+)$/i);
      if (sendModeMatch) {
        const normalizedSendMode = normalizeSupportedSendMode(sendModeMatch[1]);
        cursor += 1;
        if (!normalizedSendMode) {
          skippedCount += 1;
          i = cursor + 2;
          continue;
        }
        sendMode = normalizedSendMode;
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

  return { success: true, ahkVersion, hotkeys, remaps, hotstrings, skippedCount };
}
