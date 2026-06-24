import assert from "node:assert/strict";
import test from "node:test";

import {
  areHotstringsDuplicate,
  findDuplicateHotstringIndex,
} from "../src/hotstrings/duplicates.js";

test("case-insensitive hotstrings collide regardless of letter case", () => {
  assert.equal(
    areHotstringsDuplicate(
      { trigger: "btw", caseSensitive: false },
      { trigger: "BTW", caseSensitive: false }
    ),
    true
  );
});

test("case-sensitive hotstrings only collide on exact trigger case", () => {
  assert.equal(
    areHotstringsDuplicate(
      { trigger: "Btw", caseSensitive: true },
      { trigger: "Btw", caseSensitive: true }
    ),
    true
  );
  assert.equal(
    areHotstringsDuplicate(
      { trigger: "Btw", caseSensitive: true },
      { trigger: "btw", caseSensitive: true }
    ),
    false
  );
});

test("case-sensitive and case-insensitive variants can coexist", () => {
  assert.equal(
    areHotstringsDuplicate(
      { trigger: "Btw", caseSensitive: true },
      { trigger: "Btw", caseSensitive: false }
    ),
    false
  );
});

test("duplicate lookup uses the shared hotstring identity rules", () => {
  const hotstrings = [
    { trigger: "hello", caseSensitive: false },
    { trigger: "Btw", caseSensitive: true },
  ];

  assert.equal(
    findDuplicateHotstringIndex(hotstrings, {
      trigger: "HELLO",
      caseSensitive: false,
    }),
    0
  );
  assert.equal(
    findDuplicateHotstringIndex(hotstrings, {
      trigger: "btw",
      caseSensitive: true,
    }),
    -1
  );
});
