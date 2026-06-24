import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildFullScript } from "../src/ahk/generator.js";

const EXPECTED_VERSION_PREFIX = "1.";
const DEFAULT_INSTALL_ROOT = path.join(
  process.env.LOCALAPPDATA || "",
  "Programs",
  "AutoHotkey"
);

const interpreter = await findAhkV1Interpreter();

test(
  "generated scripts are accepted by the real AutoHotkey v1 interpreter",
  { skip: interpreter ? false : "AutoHotkey v1 interpreter was not found" },
  async () => {
    const script = buildFullScript({
      version: "v1.0.0-interpreter-test",
      hotkeys: [
        {
          prefix: "^1",
          actionType: "send",
          actionValue:
            "Progress: 100% {done} ` backtick\nUnicode: zażółć 日本語 😀",
          sendMode: "Input",
          comment: "Send special characters",
        },
        {
          prefix: "^2",
          actionType: "run",
          actionValue: 'C:\\Example, Stable\\App "Test"\\app.exe',
          sendMode: "Input",
          comment: "Run a quoted path containing a comma",
        },
        {
          prefix: "^3",
          actionType: "url",
          actionValue:
            'https://example.com/search?q="hello"&next=one,two&progress=100%25',
          sendMode: "Input",
          comment: "Open a URL containing reserved characters",
        },
        {
          prefix: "^4",
          actionType: "command",
          actionValue: "cmd.exe /c echo Integration test",
          sendMode: "Input",
          comment: "Run a command",
        },
      ],
      hotstrings: [
        {
          trigger: ":clock:",
          replacement: "12:30",
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
          trigger: "tick`:",
          replacement: "trailing space ",
          autoReplace: false,
          caseSensitive: false,
          insideWord: false,
          rawText: false,
          comment: "Backtick and colon",
        },
      ],
      remaps: [
        {
          fromPrefix: "CapsLock",
          toPrefix: "Escape",
          comment: "CapsLock as Escape",
        },
      ],
    });

    const result = await runAhkScript(makeSelfTerminating(script));

    assert.equal(result.timedOut, false, "AutoHotkey did not exit before timeout");
    assert.equal(
      result.exitCode,
      0,
      `AutoHotkey rejected the generated script:\n${result.output}`
    );
    assert.match(result.marker, /^OK\|1\./);
  }
);

test(
  "the harness reports syntax errors instead of hanging",
  { skip: interpreter ? false : "AutoHotkey v1 interpreter was not found" },
  async () => {
    const result = await runAhkScript(
      [
        "#NoEnv",
        "#SingleInstance, Force",
        "This is deliberately invalid AHK syntax ???",
        "ExitApp",
      ].join("\n")
    );

    assert.equal(result.timedOut, false);
    assert.notEqual(result.exitCode, 0);
    assert.match(result.output, /error|invalid|unrecognized|line text/i);
  }
);

test(
  "AutoHotkey v1 can register colon-ending triggers through Hotstring()",
  { skip: interpreter ? false : "AutoHotkey v1 interpreter was not found" },
  async () => {
    const result = await runAhkScript(
      [
        "#NoEnv",
        "#SingleInstance, Force",
        'Hotstring(":*C::clock:", "12:30")',
        'FileAppend, % "OK|" A_AhkVersion, %A_ScriptDir%\\result.txt',
        "ExitApp",
      ].join("\n")
    );

    assert.equal(result.exitCode, 0, result.output);
    assert.match(result.marker, /^OK\|1\./);
  }
);

async function findAhkV1Interpreter() {
  const configuredPath = process.env.AHK_V1_PATH;
  if (configuredPath) return configuredPath;
  if (!process.env.LOCALAPPDATA) return null;

  let directories;
  try {
    directories = await readdir(DEFAULT_INSTALL_ROOT, {
      withFileTypes: true,
    });
  } catch {
    return null;
  }

  const versionDirectories = directories
    .filter((entry) => entry.isDirectory() && /^v1\./i.test(entry.name))
    .map((entry) => entry.name)
    .sort(compareVersionDirectories)
    .reverse();
  const executableNames =
    process.arch === "x64"
      ? ["AutoHotkeyU64.exe", "AutoHotkeyU32.exe", "AutoHotkey.exe"]
      : ["AutoHotkeyU32.exe", "AutoHotkey.exe"];

  for (const directory of versionDirectories) {
    for (const executableName of executableNames) {
      const candidate = path.join(
        DEFAULT_INSTALL_ROOT,
        directory,
        executableName
      );
      try {
        await readFile(candidate);
        return candidate;
      } catch {
        // Continue with the next known v1 executable name.
      }
    }
  }

  return null;
}

function compareVersionDirectories(left, right) {
  const leftParts = left.slice(1).split(".").map(Number);
  const rightParts = right.slice(1).split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index++) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function makeSelfTerminating(script) {
  const prelude = [
    "SetTimer, __AHKGEN_TEST_FINISH, -50",
    "",
  ].join("\n");
  const marker = "SetWorkingDir, %A_ScriptDir%\n";
  const instrumented = script.replace(marker, `${marker}${prelude}`);

  return [
    instrumented,
    "",
    "__AHKGEN_TEST_FINISH:",
    'FileAppend, % "OK|" A_AhkVersion, %A_ScriptDir%\\result.txt',
    "ExitApp",
  ].join("\n");
}

async function runAhkScript(script, timeoutMs = 5000) {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "ahkgen-interpreter-")
  );
  const scriptPath = path.join(temporaryDirectory, "test.ahk");
  const resultPath = path.join(temporaryDirectory, "result.txt");
  await writeFile(scriptPath, `\uFEFF${script}`, "utf8");

  try {
    const execution = await spawnWithTimeout(
      interpreter,
      ["/ErrorStdOut", scriptPath],
      timeoutMs
    );
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
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
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

assert.ok(
  !interpreter || path.basename(interpreter).toLowerCase().includes("autohotkey"),
  "AHK_V1_PATH must point to an AutoHotkey executable"
);

if (interpreter) {
  const versionProbe = await runAhkScript(
    [
      "#NoEnv",
      "#SingleInstance, Force",
      'FileAppend, % "OK|" A_AhkVersion, %A_ScriptDir%\\result.txt',
      "ExitApp",
    ].join("\n")
  );
  assert.match(
    versionProbe.marker,
    new RegExp(`^OK\\|${EXPECTED_VERSION_PREFIX.replace(".", "\\.")}`),
    `${interpreter} is not an AutoHotkey v1 interpreter`
  );
}
