import assert from "node:assert/strict";
import test from "node:test";

import {
  escapeForRun,
  escapeForSend,
  escapeForExpressionString,
  escapeHotstringTrigger,
  unescapeFromExpressionString,
  unescapeFromRun,
  unescapeFromSend,
  unescapeHotstringTrigger,
} from "../src/ahk/escaping.js";
import { buildFullScript, buildHotstringLine } from "../src/ahk/generator.js";
import {
  parseAhkScript,
  parseHotstringDefinition,
  parseHotstringFunction,
} from "../src/ahk/parser.js";

test("Send escaping preserves special characters in a round-trip", () => {
  const cases = [
    "{",
    "}",
    "{}",
    "{Enter}",
    "{Space}",
    "{Tab}",
    "^!+#",
    "%name%",
    "`n",
    "`%",
    "\tindented\t",
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

test("Run escaping protects commas from AHK parameter parsing", () => {
  const input = "C:\\Apps\\a,b.exe";
  const escaped = escapeForRun(input);

  assert.equal(escaped, "C:\\Apps\\a`,b.exe");
  assert.equal(unescapeFromRun(`"${escaped}"`), input);
});

test("Run escaping protects percent signs from AHK variable expansion", () => {
  const input =
    "https://example.com/search?progress=100%25&literal=`%&items=one,two";
  const escaped = escapeForRun(input);

  assert.equal(
    escaped,
    "https://example.com/search?progress=100`%25&literal=```%&items=one`,two"
  );
  assert.equal(unescapeFromRun(`"${escaped}"`), input);
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

test("AHK expression strings preserve replacement text", () => {
  const input = 'Quote: "hello", backtick: `, tab:\t\nnext line';
  assert.equal(
    unescapeFromExpressionString(escapeForExpressionString(input)),
    input
  );
});

test("hotstrings use the unambiguous Hotstring function syntax", () => {
  const hotstring = {
    trigger: ":clock:",
    replacement: 'Time: "12:30"` now\n',
    autoReplace: true,
    caseSensitive: true,
    insideWord: false,
    rawText: false,
    comment: "Clock",
  };
  const line = buildHotstringLine(hotstring);

  assert.match(line, /^; Clock\nHotstring\(/);
  assert.deepEqual(parseHotstringFunction(line.split("\n")[1]), {
    options: "*C",
    trigger: hotstring.trigger,
    replacement: hotstring.replacement,
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

function roundTripHotkey(hotkey) {
  const script = buildFullScript({
    version: "v1.0.0-test",
    hotkeys: [hotkey],
    hotstrings: [],
    remaps: [],
  });
  const parsed = parseAhkScript(script);

  assert.equal(parsed.success, true);
  assert.equal(parsed.skippedCount, 0);
  assert.equal(parsed.hotkeys.length, 1);
  return parsed.hotkeys[0];
}

test("Send hotkeys survive round-trips with special text", () => {
  const cases = [
    {
      value: "Plain text",
      sendMode: "Input",
    },
    {
      value: "{Enter} ^Ctrl !Alt +Shift #Win",
      sendMode: "Event",
    },
    {
      value: "Progress: 100% `n and a literal backtick: `",
      sendMode: "Input",
    },
    {
      value: "  leading and trailing spaces  ",
      sendMode: "Input",
    },
    {
      value: "\tTabbed text\t",
      sendMode: "Event",
    },
    {
      value: "First line\nSecond line\r\nThird line",
      expectedValue: "First line\nSecond line\nThird line",
      sendMode: "Input",
    },
    {
      value: "Unicode: café, zażółć, 日本語, 😀",
      sendMode: "Input",
    },
  ];

  for (const [index, testCase] of cases.entries()) {
    const input = {
      prefix: `^${index + 1}`,
      actionType: "send",
      actionValue: testCase.value,
      sendMode: testCase.sendMode,
      comment: `Send case ${index + 1}`,
    };

    assert.deepEqual(roundTripHotkey(input), {
      ...input,
      actionValue: testCase.expectedValue ?? testCase.value,
    });
  }
});

test("Run hotkeys survive round-trips with Windows paths", () => {
  const cases = [
    "C:\\Windows\\notepad.exe",
    "C:\\Program Files\\Example App\\app.exe",
    "C:\\Apps\\release,stable\\app.exe",
    "C:\\Tools\\back`tick\\app.exe",
    'C:\\Example "Quoted"\\app.exe',
  ];

  for (const [index, path] of cases.entries()) {
    const input = {
      prefix: `#${index + 1}`,
      actionType: "run",
      actionValue: path,
      sendMode: "Input",
      comment: `Run case ${index + 1}`,
    };

    assert.deepEqual(roundTripHotkey(input), input);
  }
});

test("URL hotkeys survive round-trips with query strings", () => {
  const cases = [
    "https://example.com",
    "http://localhost:3000/path",
    "https://example.com/search?q=hello%20world",
    "https://example.com/items?first=one,second=two",
    "https://example.com/?redirect=https%3A%2F%2Fopenai.com",
    'https://example.com/?q="quoted"',
  ];

  for (const [index, url] of cases.entries()) {
    const input = {
      prefix: `!${index + 1}`,
      actionType: "url",
      actionValue: url,
      sendMode: "Input",
      comment: `URL case ${index + 1}`,
    };

    assert.deepEqual(roundTripHotkey(input), input);
  }
});

test("Command hotkeys survive round-trips without changing raw commands", () => {
  const cases = [
    "shutdown /a",
    "cmd.exe /c echo Hello",
    "powershell.exe -NoProfile -Command Get-Date",
    "ping 127.0.0.1 -n 3",
    "rundll32.exe shell32.dll`,Control_RunDLL",
  ];

  for (const [index, command] of cases.entries()) {
    const input = {
      prefix: `+${index + 1}`,
      actionType: "command",
      actionValue: command,
      sendMode: "Input",
      comment: `Command case ${index + 1}`,
    };

    assert.deepEqual(roundTripHotkey(input), input);
  }
});

test("Send actions preserve leading and trailing whitespace", () => {
  const input = {
    version: "v1.0.0-test",
    hotkeys: [
      {
        prefix: "^Space",
        actionType: "send",
        actionValue: "  padded text  ",
        sendMode: "Input",
        comment: "",
      },
    ],
    hotstrings: [],
    remaps: [],
  };

  const parsed = parseAhkScript(buildFullScript(input));

  assert.equal(parsed.hotkeys[0].actionValue, input.hotkeys[0].actionValue);
  assert.match(
    buildFullScript(input),
    /Send, \{Space\}\{Space\}padded text\{Space\}\{Space\}/
  );
});

test("Send actions preserve leading and trailing line breaks", () => {
  const input = {
    version: "v1.0.0-test",
    hotkeys: [
      {
        prefix: "^Enter",
        actionType: "send",
        actionValue: "\nfirst line\nsecond line\n",
        sendMode: "Input",
        comment: "",
      },
    ],
    hotstrings: [],
    remaps: [],
  };

  const parsed = parseAhkScript(buildFullScript(input));

  assert.equal(parsed.hotkeys[0].actionValue, input.hotkeys[0].actionValue);
});

test("hotstring replacements preserve leading and trailing whitespace", () => {
  const input = {
    version: "v1.0.0-test",
    hotkeys: [],
    hotstrings: [
      {
        trigger: "pad",
        replacement: "  padded replacement  ",
        autoReplace: true,
        caseSensitive: false,
        insideWord: false,
        rawText: false,
        comment: "",
      },
    ],
    remaps: [],
  };

  const parsed = parseAhkScript(buildFullScript(input));

  assert.equal(
    parsed.hotstrings[0].replacement,
    input.hotstrings[0].replacement
  );
  assert.match(
    buildFullScript(input),
    /Hotstring\(":\*:pad", "  padded replacement  "\)/
  );
});

test("parser rejects scripts without the AHKgen signature", () => {
  assert.deepEqual(parseAhkScript("^j::\n    Send, test\nreturn"), {
    success: false,
    errorKey: "error.missingSignature",
  });
});
