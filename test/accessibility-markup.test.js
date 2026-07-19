import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function getInputById(html, id) {
  return html.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`))?.[0] ?? "";
}

test("header switches stay mouse-accessible but outside sequential Tab navigation", async () => {
  const htmlUrl = new URL("../src/index.html", import.meta.url);
  const html = await readFile(htmlUrl, "utf8");

  for (const id of ["ahk-version-toggle", "theme-toggle-checkbox"]) {
    const input = getInputById(html, id);
    assert.ok(input, `Missing #${id}`);
    assert.match(input, /\brole="switch"/);
    assert.match(input, /\btabindex="-1"/);
  }
});

test("language picker is labelled without making the surrounding text clickable", async () => {
  const htmlUrl = new URL("../src/index.html", import.meta.url);
  const html = await readFile(htmlUrl, "utf8");

  assert.doesNotMatch(html, /<label\b[^>]*\bfor="language-picker-button"/);
  assert.match(
    html,
    /<button\b[^>]*\bid="language-picker-button"[^>]*\baria-labelledby="settings-language-label language-picker-current-label"/
  );
});

test("About exposes the repository as an external link", async () => {
  const htmlUrl = new URL("../src/index.html", import.meta.url);
  const html = await readFile(htmlUrl, "utf8");

  assert.match(
    html,
    /<a\b[^>]*\bid="about-repository-link"[^>]*\bhref="https:\/\/github\.com\/insmnaxd\/AHKforge"[^>]*>/
  );
});
