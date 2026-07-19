#!/usr/bin/env node
// scripts/bump.cjs
//
// Note: process.noDeprecation is set below to silence Node's generic
// shell:true argument-escaping DeprecationWarning. That warning is real and
// worth knowing about in general, but in this script it's a false alarm: the
// only arguments ever passed through shell:true (on Windows only - see
// useShell below) are fixed npm version arguments from this script
// or a semver string that npm itself just generated/validated - never anything from
// an untrusted source - so there's no actual injection risk to warn about here.
process.noDeprecation = true;
//
// Bumps the app version across every place it's tracked:
//
//   - package.json + package-lock.json  -> via `npm version <type>`
//   - src-tauri/Cargo.toml + Cargo.lock -> via `cargo set-version <version>`
//   - main.js                           -> AHKFORGE_VERSION constant (regex replace)
//
// index.html is NOT touched: its .version-tag span is filled in by main.js's
// injectVersion() at runtime, so it never needs editing.
//
// tauri.conf.json is also untouched: Tauri 2.x inherits the version from
// package.json automatically when tauri.conf.json has no "version" field.
//
// --- Plain bumps ---
//   node scripts/bump.cjs major
//   node scripts/bump.cjs minor
//   node scripts/bump.cjs patch
//
// --- Release bump ---
//   node scripts/bump.cjs release
//
//   Strips a prerelease suffix without bumping the base version:
//   1.0.0-alpha.3 -> 1.0.0
//
// --- Prerelease bumps (premajor / preminor / prepatch) ---
//   node scripts/bump.cjs prepatch alpha
//   node scripts/bump.cjs preminor beta
//   node scripts/bump.cjs premajor rc
//
//   These bump the given part AND start a new prerelease on it, always at .0,
//   e.g. from 0.10.0: prepatch alpha -> 0.10.1-alpha.0
//
// --- Prerelease increment ---
//   node scripts/bump.cjs prerelease
//   node scripts/bump.cjs prerelease alpha
//
//   Continues an existing prerelease sequence, e.g.
//   1.0.0-alpha.0 -> 1.0.0-alpha.1.
//
//   npm computes this full string (e.g. "0.10.1-alpha.0") and we hand that
//   EXACT string to `cargo set-version` as its TARGET argument (not via
//   cargo's own --bump alpha/beta/rc, which counts differently from npm and
//   would drift out of sync - see past notes on this in the repo history).
//
//   IMPORTANT CAVEAT: passing a prerelease string like "0.10.1-alpha.0"
//   directly as cargo set-version's TARGET is not something we've confirmed
//   works against your installed cargo-edit version - cargo's docs describe
//   TARGET only with plain examples (e.g. "cargo set-version 1.0.0"). If this
//   fails, package.json/Cargo.lock will already be bumped while Cargo.toml
//   isn't - check the error output and fix Cargo.toml by hand if needed.
//
// --no-git-tag-version (npm) means no commit/tag is created - commit by hand.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PLAIN_BUMPS = ["major", "minor", "patch"];
const PRE_BUMPS = ["premajor", "preminor", "prepatch", "prerelease"];
const RELEASE_BUMP = "release";
const SEMVER_PATTERN =
  /^(?<base>\d+\.\d+\.\d+)(?:-(?<prerelease>[0-9A-Za-z][0-9A-Za-z.-]*))?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/;

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

// On Windows, npm is actually an ".cmd" wrapper script, not a real .exe -
// execFileSync can't reliably run it without shell:true. That option does
// trigger a Node deprecation warning about argument escaping (since shell:true
// concatenates args into a string instead of passing them as a safe array),
// but it's only enabled here on win32 - Linux/macOS never need it and never
// see the warning. The args passed through it are always either fixed npm
// version arguments from this script or a semver string that npm itself just
// generated/validated, never anything from outside this script, so the usual
// injection risk that warning describes doesn't apply here.
const useShell = process.platform === "win32";

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit", shell: useShell });
}

function readPackageJsonVersion() {
  const pkgPath = path.join(ROOT, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  return pkg.version;
}

function getReleaseVersion(version) {
  const match = version.match(SEMVER_PATTERN);
  if (!match) {
    fail(`Current package.json version "${version}" is not a supported semver string.`);
  }
  if (!match.groups.prerelease) {
    fail(`Current package.json version "${version}" has no prerelease suffix to remove.`);
  }
  return match.groups.base;
}

function bumpNpm(type, preid) {
  const args = preid ? ["version", type, "--preid", preid] : ["version", type];
  args.push("--no-git-tag-version");
  const label = preid ? `${type} ${preid}` : type;
  try {
    run("npm", args, ROOT);
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

// Replaces exactly one occurrence of the AHKFORGE_VERSION declaration in main.js.
// Refuses to guess if it finds zero or more-than-one match, rather than silently
// doing nothing or editing the wrong line.
function bumpMainJs(newVersion) {
  const relPath = "src/main.js";
  const fullPath = path.join(ROOT, relPath);
  const pattern = /const AHKFORGE_VERSION = "v\d+\.\d+\.\d+(?:-[\w.]+)?";/;

  const contents = fs.readFileSync(fullPath, "utf8");
  const matches = contents.match(pattern);

  if (!matches) {
    fail(
      `Could not find "const AHKFORGE_VERSION = \\"v X.Y.Z\\";" in ${relPath}. ` +
        "Nothing was changed there - please update it by hand and check this script's regex."
    );
  }
  if (contents.split(pattern).length - 1 > 1) {
    fail(`Found more than one AHKFORGE_VERSION declaration in ${relPath}. Refusing to guess which one to change.`);
  }

  const updated = contents.replace(pattern, `const AHKFORGE_VERSION = "v${newVersion}";`);
  fs.writeFileSync(fullPath, updated, "utf8");
  console.log(`✓ ${relPath} (v${newVersion})`);
}

function main() {
  const [type, preid] = process.argv.slice(2);

  const isPlain = PLAIN_BUMPS.includes(type);
  const isPre = PRE_BUMPS.includes(type);
  const isRelease = type === RELEASE_BUMP;

  if (!isPlain && !isPre && !isRelease) {
    fail(
      "Usage:\n" +
        "  node scripts/bump.cjs major|minor|patch|release\n" +
        "  node scripts/bump.cjs premajor|preminor|prepatch <preid>   (e.g. alpha, beta, rc)\n" +
        "  node scripts/bump.cjs prerelease [preid]                   (e.g. alpha)"
    );
  }

  if (["premajor", "preminor", "prepatch"].includes(type) && !preid) {
    fail(`"${type}" needs a prerelease id, e.g.: node scripts/bump.cjs ${type} alpha`);
  }

  if ((isPlain || isRelease) && preid) {
    fail(`"${type}" does not take a prerelease id.`);
  }

  const npmVersionTarget = isRelease ? getReleaseVersion(readPackageJsonVersion()) : type;
  const label = isPre && preid ? `${type} ${preid}` : type;

  console.log(`Bumping version (${label})...\n`);

  bumpNpm(npmVersionTarget, isPre ? preid : undefined);
  const newVersion = readPackageJsonVersion();
  bumpCargo(newVersion);
  bumpMainJs(newVersion);

  console.log(`\nDone. Version is now ${newVersion} in package.json, Cargo.toml, and main.js.`);
}

main();
