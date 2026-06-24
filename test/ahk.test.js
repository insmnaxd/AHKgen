import assert from "node:assert/strict";
import test from "node:test";

import {
  escapeForRun,
  escapeForSend,
  escapeHotstringTrigger,
  unescapeFromRun,
  unescapeFromSend,
  unescapeHotstringTrigger,
} from "../src/ahk/escaping.js";
import { buildFullScript } from "../src/ahk/generator.js";
import { parseAhkScript, parseHotstringDefinition } from "../src/ahk/parser.js";

test("Send escaping preserves special characters in a round-trip", () => {
  const cases = [
    "{",
    "}",
    "{}",
    "{Enter}",
    "^!+#",
    "%name%",
    "`n",
    "`%",
    "Progress: 100% {done}\nNext line",
  ];

  for (const input of cases) {
    assert.equal(unescapeFromSend(escapeForSend(input)), input);
  }
});

test("Run escaping preserves quoted paths and URLs", () => {
  const cases = [
    'C:\\Program Files\\Example "Test"\\app.exe',
    'https://example.com/?q="hello"',
  ];

  for (const input of cases) {
    assert.equal(unescapeFromRun(`"${escapeForRun(input)}"`), input);
  }
});

test("hotstring trigger escaping supports colons and backticks", () => {
  const cases = ["a:b", ":abc", "abc:", ":", "a::b", "::", "a`b", "`:"];

  for (const input of cases) {
    assert.equal(unescapeHotstringTrigger(escapeHotstringTrigger(input)), input);
  }
});

test("hotstring parser ignores escaped delimiter colons", () => {
  assert.deepEqual(parseHotstringDefinition(":C:a`:`:b::12:30"), {
    options: "C",
    trigger: "a::b",
    replacement: "12:30",
  });
});

test("complete AHK script survives export and import", () => {
  const input = {
    version: "v1.0.0-test",
    hotkeys: [
      {
        prefix: "^j",
        actionType: "send",
        actionValue: "Progress: 100% {done}\nNext line `n",
        sendMode: "Event",
        comment: "Test text",
      },
      {
        prefix: "#b",
        actionType: "url",
        actionValue: 'https://example.com/?q="hello"',
        sendMode: "Input",
        comment: "",
      },
      {
        prefix: "!r",
        actionType: "run",
        actionValue: 'C:\\Program Files\\Example "Test"\\app.exe',
        sendMode: "Input",
        comment: "Launch application",
      },
      {
        prefix: "+c",
        actionType: "command",
        actionValue: "shutdown /a",
        sendMode: "Input",
        comment: "",
      },
    ],
    hotstrings: [
      {
        trigger: "time:",
        replacement: "12:30",
        autoReplace: true,
        caseSensitive: true,
        insideWord: false,
        rawText: false,
        comment: "Time",
      },
      {
        trigger: "a::b",
        replacement: "literal {Enter}",
        autoReplace: false,
        caseSensitive: false,
        insideWord: true,
        rawText: true,
        comment: "",
      },
    ],
    remaps: [
      {
        fromPrefix: "CapsLock",
        toPrefix: "Escape",
        comment: "Caps as Escape",
      },
    ],
  };

  const script = buildFullScript(input);
  const parsed = parseAhkScript(script);

  assert.equal(parsed.success, true);
  assert.equal(parsed.skippedCount, 0);
  assert.deepEqual(parsed.hotkeys, input.hotkeys);
  assert.deepEqual(parsed.hotstrings, input.hotstrings);
  assert.deepEqual(parsed.remaps, input.remaps);
});

test("parser rejects scripts without the AHKgen signature", () => {
  assert.deepEqual(parseAhkScript("^j::\n    Send, test\nreturn"), {
    success: false,
    errorKey: "error.missingSignature",
  });
});
