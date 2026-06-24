import { AHKGEN_SIGNATURE_PREFIX } from "./constants.js";
import { escapeForRun, escapeForSend, escapeHotstringTrigger } from "./escaping.js";

export function buildActionLine(type, value) {
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

export function buildHotkeyBlock(hotkey) {
  const lines = [];
  if (hotkey.comment) {
    lines.push(`; ${hotkey.comment}`);
  }
  lines.push(`${hotkey.prefix}::`);

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

export function buildHotstringLine(hotstring) {
  const lines = [];
  if (hotstring.comment) {
    lines.push(`; ${hotstring.comment}`);
  }

  let options = "";
  if (hotstring.autoReplace) options += "*";
  if (hotstring.caseSensitive) options += "C";
  if (hotstring.insideWord) options += "?";
  if (hotstring.rawText) options += "R";

  const optionsPart = options ? `:${options}:` : "::";
  const replacement = /[ \t]$/.test(hotstring.replacement)
    ? `${hotstring.replacement}\``
    : hotstring.replacement;
  lines.push(`${optionsPart}${escapeHotstringTrigger(hotstring.trigger)}::${replacement}`);
  return lines.join("\n");
}

export function buildFullScript({ version, hotkeys = [], remaps = [], hotstrings = [] }) {
  const header = [
    `${AHKGEN_SIGNATURE_PREFIX} ${version}`,
    "; AutoHotkey v1",
    "#NoEnv",
    "#SingleInstance, Force",
    "SendMode, Input",
    "SetWorkingDir, %A_ScriptDir%",
    "",
  ].join("\n");

  if (hotkeys.length === 0 && remaps.length === 0 && hotstrings.length === 0) {
    return header + "\n; No hotkeys, hotstrings, or remaps added yet.";
  }

  const blocks = [];
  if (hotkeys.length > 0) {
    blocks.push("; --- Hotkeys ---");
    blocks.push(hotkeys.map(buildHotkeyBlock).join("\n\n"));
  }
  if (hotstrings.length > 0) {
    blocks.push("; --- Hotstrings ---");
    blocks.push(hotstrings.map(buildHotstringLine).join("\n\n"));
  }
  if (remaps.length > 0) {
    blocks.push("; --- Key remaps ---");
    blocks.push(remaps.map(buildRemapBlock).join("\n\n"));
  }

  return header + "\n" + blocks.join("\n\n");
}
