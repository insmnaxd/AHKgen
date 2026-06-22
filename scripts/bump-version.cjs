#!/usr/bin/env node
// scripts/bump-version.js
//
// Synchronizes the app version between package.json/package-lock.json and
// src-tauri/Cargo.toml/Cargo.lock, by delegating entirely to the tools that
// already know how to do this correctly:
//
//   - `npm version ...` updates package.json AND package-lock.json.
//   - `cargo set-version <x.y.z>` (requires cargo-edit) updates
//     src-tauri/Cargo.toml AND src-tauri/Cargo.lock.
//
// npm computes the new semver (including prerelease handling); we then read
// the resulting version back out of package.json and hand that exact string
// to cargo, so there's a single source of truth for the version math.
//
// index.html (.version-tag span) and main.js (AHKGEN_VERSION constant) are
// intentionally NOT touched here - those are updated by hand.
//
// tauri.conf.json is also untouched: Tauri 2.x inherits the version from
// package.json automatically when tauri.conf.json has no "version" field.
//
// Commits/tags are intentionally skipped (--no-git-tag-version) - commit by hand.
//
// --- Usage ---
//
//   node scripts/bump-version.js major
//   node scripts/bump-version.js minor
//   node scripts/bump-version.js patch
//       Plain bumps, no prerelease suffix. E.g. 0.10.0 -> 0.11.0 (minor).
//
//   node scripts/bump-version.js premajor <preid>
//   node scripts/bump-version.js preminor <preid>
//   node scripts/bump-version.js prepatch <preid>
//       Bumps the given part AND starts a NEW prerelease on it, always at .0 -
//       even if you're already mid-prerelease. E.g.:
//            from 0.10.0:          prepatch alpha -> 0.10.1-alpha.0
//            from 0.10.1-alpha.0:  prepatch alpha -> 0.10.2-alpha.0  (bumps again, .0 again)
//       Use this when you want to move to the NEXT major/minor/patch as a
//       fresh prerelease, not continue the current one.
//
//   node scripts/bump-version.js prerelease <preid>
//       Continues the CURRENT prerelease without bumping major/minor/patch -
//       just increments the prerelease counter. E.g.:
//            0.10.1-alpha.0 -- prerelease alpha --> 0.10.1-alpha.1
//       If you're currently on a plain release (no prerelease suffix), this
//       falls back to behaving like "prepatch": bumps patch and starts at .0.
//       E.g. from 0.10.0: prerelease alpha -> 0.10.1-alpha.0
//
//   node scripts/bump-version.js release
//       Strips a prerelease suffix, promoting to the plain version underneath.
//       E.g. 0.10.1-alpha.2 -> 0.10.1
//
// Pass no leading "v" anywhere - both npm and cargo expect a bare semver.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

const PLAIN_BUMPS = ["major", "minor", "patch"];
const PRE_BUMPS = ["premajor", "preminor", "prepatch", "prerelease"];

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function printUsageAndExit() {
  fail(
    "Usage:\n" +
      "  node scripts/bump-version.js major|minor|patch\n" +
      "  node scripts/bump-version.js premajor|preminor|prepatch <preid>   (new prerelease, e.g. alpha, beta, rc)\n" +
      "  node scripts/bump-version.js prerelease <preid>                   (continue the current prerelease)\n" +
      "  node scripts/bump-version.js release                              (strips a prerelease suffix)"
  );
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function readPackageJsonVersion() {
  const pkgPath = path.join(ROOT, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  return pkg.version;
}

function bumpNpm(npmVersionArgs, label) {
  try {
    run("npm", ["version", ...npmVersionArgs, "--no-git-tag-version"], ROOT);
    console.log(`✓ package.json + package-lock.json (${label})`);
  } catch (err) {
    fail("npm version failed. See the output above for details.");
  }
}

function bumpCargo(newVersion) {
  try {
    run("cargo", ["set-version", newVersion], path.join(ROOT, "src-tauri"));
    console.log(`✓ src-tauri/Cargo.toml + Cargo.lock (${newVersion})`);
  } catch (err) {
    fail(
      "cargo set-version failed. Make sure cargo-edit is installed (`cargo install cargo-edit`) " +
        "and that src-tauri/Cargo.toml exists."
    );
  }
}

function main() {
  const [type, preid] = process.argv.slice(2);

  if (!type) printUsageAndExit();

  if (PLAIN_BUMPS.includes(type)) {
    bumpNpm([type], type);
  } else if (PRE_BUMPS.includes(type)) {
    if (!preid) {
      fail(`"${type}" needs a prerelease id, e.g.: node scripts/bump-version.js ${type} alpha`);
    }
    bumpNpm([type, "--preid", preid], `${type} ${preid}`);
  } else if (type === "release") {
    // npm's own quirk: running "patch" while sitting on a prerelease strips the
    // suffix and lands on the plain version underneath, WITHOUT bumping the
    // patch number further - that's exactly the "release" behavior we want.
    bumpNpm(["patch"], "release");
  } else {
    console.error(`Unrecognized command: "${type}"`);
    printUsageAndExit();
  }

  const newVersion = readPackageJsonVersion();
  bumpCargo(newVersion);

  console.log(
    `\nDone. package.json, package-lock.json, Cargo.toml and Cargo.lock are now at ${newVersion}.\n` +
      `Remember to update index.html (.version-tag) and main.js (AHKGEN_VERSION) by hand.`
  );
}

main();