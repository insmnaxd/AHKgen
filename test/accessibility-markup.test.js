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
