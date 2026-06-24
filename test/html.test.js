import assert from "node:assert/strict";
import test from "node:test";

import { escapeHtml } from "../src/ui/html.js";

test("HTML escaping covers text and attribute delimiters", () => {
  assert.equal(
    escapeHtml(`<button title="Tom & Jerry's">`),
    "&lt;button title=&quot;Tom &amp; Jerry&#39;s&quot;&gt;"
  );
});
