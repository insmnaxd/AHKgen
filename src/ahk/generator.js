import { AHKGEN_SIGNATURE_PREFIX } from "./constants.js";
import {
  escapeForExpressionString,
  escapeForRun,
  escapeForSend,
  escapeForV2Send,
  escapeForV2ExpressionString,
} from "./escaping.js";
import { AHK_VERSION_V2, normalizeAhkVersion } from "./versions.js";

export function buildActionLine(type, value, { ahkVersion = "v1", sendMode = "Input" } = {}) {
  if (normalizeAhkVersion(ahkVersion) === AHK_VERSION_V2) {
    const escapedValue = escapeForV2ExpressionString(value);
    switch (type) {
      case "send": {
        const sendFunction = sendMode === "Event" ? "SendEvent" : "SendInput";
        return `    ${sendFunction}("${escapeForV2Send(value)}")`;
      }
      case "run":
      case "url":
        return `    Run("${escapedValue}")`;
      case "command":
        return `    Run "${escapedValue}"`;
      default:
        return "";
    }
  }

  switch (type) {
    case "send":
      return `    Send, ${escapeForSend(value)}`;
    case "run":
    case "url":
      return `    Run, "${escapeForRun(value)}"`;
    case "command":
      return `    Run, ${value}`;
    default:
      return "";
  }
}

export function buildHotkeyBlock(hotkey, ahkVersion = "v1") {
  const lines = [];
  if (hotkey.comment) {
    lines.push(`; ${hotkey.comment}`);
  }
  lines.push(`${hotkey.prefix}::`);

  if (normalizeAhkVersion(ahkVersion) === AHK_VERSION_V2) {
    lines.push("{");
    lines.push(
      buildActionLine(hotkey.actionType, hotkey.actionValue, {
        ahkVersion,
        sendMode: hotkey.sendMode,
      })
    );
    lines.push("}");
    return lines.join("\n");
  }

  if (hotkey.actionType === "send" && hotkey.sendMode && hotkey.sendMode !== "Input") {
    lines.push(`    SendMode, ${hotkey.sendMode}`);
  }

  lines.push(buildActionLine(hotkey.actionType, hotkey.actionValue));
  lines.push("return");
  return lines.join("\n");
}

export function buildRemapBlock(remap) {
  const lines = [];
  if (remap.comment) {
    lines.push(`; ${remap.comment}`);
  }
  lines.push(`${remap.fromPrefix}::${remap.toPrefix}`);
  return lines.join("\n");
}

export function buildHotstringLine(hotstring, ahkVersion = "v1") {
  const lines = [];
  if (hotstring.comment) {
    lines.push(`; ${hotstring.comment}`);
  }

  let options = "";
  if (hotstring.autoReplace) options += "*";
  if (hotstring.caseSensitive) options += "C";
  if (hotstring.insideWord) options += "?";
  if (hotstring.rawText) options += "R";

  const name = options ? `:${options}:${hotstring.trigger}` : `::${hotstring.trigger}`;
  const escapeString =
    normalizeAhkVersion(ahkVersion) === AHK_VERSION_V2
      ? escapeForV2ExpressionString
      : escapeForExpressionString;
  lines.push(
    `Hotstring("${escapeString(name)}", "${escapeString(
      hotstring.replacement
    )}")`
  );
  return lines.join("\n");
}

export function buildFullScript({
  version,
  ahkVersion = "v1",
  hotkeys = [],
  remaps = [],
  hotstrings = [],
}) {
  const normalizedVersion = normalizeAhkVersion(ahkVersion);
  const headerLines =
    normalizedVersion === AHK_VERSION_V2
      ? [
          `${AHKGEN_SIGNATURE_PREFIX} ${version}`,
          "; AutoHotkey v2",
          "#Requires AutoHotkey v2.0",
          "#SingleInstance Force",
          "SetWorkingDir(A_ScriptDir)",
          "",
        ]
      : [
          `${AHKGEN_SIGNATURE_PREFIX} ${version}`,
          "; AutoHotkey v1",
          "#Requires AutoHotkey v1.1.33+",
          "#NoEnv",
          "#SingleInstance, Force",
          "SendMode, Input",
          "SetWorkingDir, %A_ScriptDir%",
          "",
        ];
  const header = headerLines.join("\n");

  if (hotkeys.length === 0 && remaps.length === 0 && hotstrings.length === 0) {
    return header + "\n; No hotkeys, hotstrings, or remaps added yet.";
  }

  const blocks = [];
  if (hotstrings.length > 0) {
    blocks.push("; --- Hotstrings ---");
    blocks.push(
      hotstrings.map((hotstring) => buildHotstringLine(hotstring, normalizedVersion)).join("\n\n")
    );
  }
  if (hotkeys.length > 0) {
    blocks.push("; --- Hotkeys ---");
    blocks.push(hotkeys.map((hotkey) => buildHotkeyBlock(hotkey, normalizedVersion)).join("\n\n"));
  }
  if (remaps.length > 0) {
    blocks.push("; --- Key remaps ---");
    blocks.push(remaps.map(buildRemapBlock).join("\n\n"));
  }

  return header + "\n" + blocks.join("\n\n");
}
