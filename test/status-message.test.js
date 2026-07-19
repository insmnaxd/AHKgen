import assert from "node:assert/strict";
import test from "node:test";

import {
  setAnimatedMessage,
  startMessageExit,
} from "../src/ui/status-message.js";

test("status messages restart their entrance animation", () => {
  const classes = new Set(["message-entering"]);
  let layoutReads = 0;
  const element = {
    textContent: "",
    classList: {
      add: (name) => classes.add(name),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
    },
    get offsetWidth() {
      layoutReads += 1;
      return 0;
    },
  };

  setAnimatedMessage(element, "Something went wrong.");

  assert.equal(element.textContent, "Something went wrong.");
  assert.equal(classes.has("message-entering"), true);
  assert.equal(layoutReads, 1);
});

test("status messages can start their exit animation", () => {
  const classes = new Set(["message-entering"]);
  const element = {
    textContent: "Something went wrong.",
    classList: {
      add: (name) => classes.add(name),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
    },
  };

  startMessageExit(element);

  assert.equal(classes.has("message-entering"), false);
  assert.equal(classes.has("message-leaving"), true);
});
