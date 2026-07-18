import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildFullScript } from "../src/ahk/generator.js";

const DEFAULT_INTERPRETER = path.join(
  process.env.LOCALAPPDATA || "",
  "Programs",
  "AutoHotkey",
  "v2",
  process.arch === "x64" ? "AutoHotkey64.exe" : "AutoHotkey32.exe"
);
const interpreter = await findInterpreter();

test(
  "generated scripts are accepted by the real AutoHotkey v2 interpreter",
  { skip: interpreter ? false : "AutoHotkey v2 interpreter was not found" },
  async () => {
    const script = buildFullScript({
      version: "v1.0.0-interpreter-test",
      ahkVersion: "v2",
      hotkeys: [
        {
          prefix: "^1",
          actionType: "send",
          actionValue: 'Progress: 100% {done} ` "quote"\nUnicode: zażółć 日本語 😀',
          sendMode: "Input",
          comment: "Send special characters",
        },
        {
          prefix: "^2",
          actionType: "send",
          actionValue: "Event mode",
          sendMode: "Event",
          comment: "Alternative send mode",
        },
        {
          prefix: "^3",
          actionType: "run",
          actionValue: 'C:\\Example, Stable\\App "Test"\\app.exe',
          sendMode: "Input",
          comment: "Run a quoted path containing a comma",
        },
        {
          prefix: "^4",
          actionType: "url",
          actionValue: 'https://example.com/search?q="hello"&items=one,two&progress=100%25',
          sendMode: "Input",
          comment: "Open a URL",
        },
        {
          prefix: "^5",
          actionType: "command",
          actionValue: 'cmd.exe /c echo "Integration test"',
          sendMode: "Input",
          comment: "Run a command",
        },
        {
          prefix: "XButton1",
          actionType: "send",
          actionValue: "Mouse hotkey",
          sendMode: "Input",
          comment: "Mouse button hotkey",
        },
      ],
      hotstrings: [
        {
          trigger: ":clock:",
          replacement: '12:30 "quoted" ` tick',
          autoReplace: true,
          caseSensitive: true,
          insideWord: false,
          rawText: false,
          comment: "Colons at both ends",
        },
        {
          trigger: "a::b",
          replacement: "literal {Enter} and 100%",
          autoReplace: false,
          caseSensitive: false,
          insideWord: true,
          rawText: true,
          comment: "Double colon inside trigger",
        },
        {
          trigger: "multiline",
          replacement: "First line\nSecond line +{Enter}\nThird line",
          autoReplace: true,
          caseSensitive: false,
          insideWord: false,
          rawText: false,
          comment: "Multiline replacement",
        },
      ],
      remaps: [
        { fromPrefix: "CapsLock", toPrefix: "Escape", comment: "Keyboard remap" },
        { fromPrefix: "XButton2", toPrefix: "MButton", comment: "Mouse remap" },
      ],
    });

    const result = await runAhkScript(makeSelfTerminating(script));

    assert.equal(result.timedOut, false, "AutoHotkey did not exit before timeout");
    assert.equal(result.exitCode, 0, `AutoHotkey rejected the generated script:\n${result.output}`);
    assert.match(result.marker, /^OK\|2\./);
  }
);

test(
  "the AutoHotkey v2 harness reports syntax errors instead of hanging",
  { skip: interpreter ? false : "AutoHotkey v2 interpreter was not found" },
  async () => {
    const result = await runAhkScript(
      [
        "#Requires AutoHotkey v2.0",
        "#SingleInstance Force",
        "This is deliberately invalid AHK syntax ???",
        "ExitApp()",
      ].join("\n")
    );

    assert.equal(result.timedOut, false);
    assert.notEqual(result.exitCode, 0);
    assert.match(result.output, /error|invalid|unrecognized|line text/i);
  }
);

async function findInterpreter() {
  const candidate = process.env.AHK_V2_PATH || DEFAULT_INTERPRETER;
  if (!candidate) return null;
  try {
    await readFile(candidate);
    return candidate;
  } catch {
    return null;
  }
}

function makeSelfTerminating(script) {
  const marker = "SetWorkingDir(A_ScriptDir)\n";
  const prelude = "SetTimer(__AHKGEN_TEST_FINISH, -50)\n";
  const instrumented = script.replace(marker, `${marker}${prelude}`);

  return [
    instrumented,
    "",
    "__AHKGEN_TEST_FINISH() {",
    '    FileAppend("OK|" A_AhkVersion, A_ScriptDir "\\result.txt")',
    "    ExitApp()",
    "}",
  ].join("\n");
}

async function runAhkScript(script, timeoutMs = 5000) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ahkgen-v2-interpreter-"));
  const scriptPath = path.join(temporaryDirectory, "test.ahk");
  const resultPath = path.join(temporaryDirectory, "result.txt");
  await writeFile(scriptPath, `\uFEFF${script}`, "utf8");

  try {
    const execution = await spawnWithTimeout(interpreter, ["/ErrorStdOut", scriptPath], timeoutMs);
    let marker = "";
    try {
      marker = await readFile(resultPath, "utf8");
    } catch {
      // Syntax-error fixtures exit before writing the success marker.
    }
    return {
      ...execution,
      marker,
      output: `${execution.stdout}\n${execution.stderr}`.trim(),
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function spawnWithTimeout(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
  });
}

if (interpreter) {
  const versionProbe = await runAhkScript(
    [
      "#Requires AutoHotkey v2.0",
      "#SingleInstance Force",
      'FileAppend("OK|" A_AhkVersion, A_ScriptDir "\\result.txt")',
      "ExitApp()",
    ].join("\n")
  );
  assert.match(versionProbe.marker, /^OK\|2\./, `${interpreter} is not an AutoHotkey v2 interpreter`);
}
