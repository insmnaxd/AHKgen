import assert from "node:assert/strict";
import test from "node:test";

import { createLanguagePicker } from "../src/ui/language-picker.js";

function createElement({ language, src = "", text = "" } = {}) {
  const listeners = new Map();
  const attributes = new Map();
  const image = { src };
  const span = { textContent: text };

  return {
    dataset: language ? { language } : {},
    hidden: true,
    focused: false,
    src,
    textContent: text,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    emit(type, event = {}) {
      listeners.get(type)?.(event);
    },
    focus() {
      this.focused = true;
    },
    getAttribute(name) {
      return attributes.get(name);
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    querySelector(selector) {
      if (selector === "img") return image;
      if (selector === "span") return span;
      return null;
    },
  };
}

function createFixture() {
  const options = [
    createElement({ language: "en", src: "flags/en.svg", text: "English" }),
    createElement({ language: "pl", src: "flags/pl.svg", text: "Polski" }),
    createElement({ language: "de", src: "flags/de.svg", text: "Deutsch" }),
  ];
  const root = createElement();
  const button = createElement();
  const listbox = createElement();
  const currentFlag = createElement();
  const currentLabel = createElement();
  const documentListeners = new Map();
  const selectListeners = new Map();
  const dispatchedEvents = [];
  const elements = new Map([
    ["#language-picker", root],
    ["#language-picker-button", button],
    ["#language-picker-options", listbox],
    ["#language-picker-current-flag", currentFlag],
    ["#language-picker-current-label", currentLabel],
  ]);

  root.contains = (target) => target === root || target === button || options.includes(target);
  listbox.querySelectorAll = () => options;
  const select = {
    value: "pl",
    addEventListener(type, handler) {
      selectListeners.set(type, handler);
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
      selectListeners.get(event.type)?.(event);
      return true;
    },
  };
  const documentLike = {
    querySelector: (selector) => elements.get(selector),
    addEventListener(type, handler) {
      documentListeners.set(type, handler);
    },
  };
  class FakeEvent {
    constructor(type, init) {
      this.type = type;
      this.bubbles = init?.bubbles ?? false;
    }
  }

  const controller = createLanguagePicker({ documentLike, select, EventClass: FakeEvent });
  controller.init();
  return {
    controller,
    root,
    button,
    listbox,
    currentFlag,
    currentLabel,
    options,
    select,
    dispatchedEvents,
  };
}

function keyboardEvent(key) {
  return {
    key,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

test("language picker synchronizes its visible flag and label", () => {
  const fixture = createFixture();

  assert.equal(fixture.currentFlag.src, "flags/pl.svg");
  assert.equal(fixture.currentLabel.textContent, "Polski");
  assert.equal(fixture.options[1].getAttribute("aria-selected"), "true");
  assert.equal(fixture.options[0].getAttribute("aria-selected"), "false");
});

test("language picker chooses a language and emits the native select change", () => {
  const fixture = createFixture();

  fixture.button.emit("click");
  fixture.options[2].emit("click");

  assert.equal(fixture.select.value, "de");
  assert.equal(fixture.dispatchedEvents.length, 1);
  assert.equal(fixture.dispatchedEvents[0].type, "change");
  assert.equal(fixture.dispatchedEvents[0].bubbles, true);
  assert.equal(fixture.currentLabel.textContent, "Deutsch");
  assert.equal(fixture.listbox.hidden, true);
  assert.equal(fixture.button.focused, true);
});

test("language picker supports keyboard navigation and selection", () => {
  const fixture = createFixture();
  const openEvent = keyboardEvent("ArrowDown");

  fixture.button.emit("keydown", openEvent);
  assert.equal(openEvent.defaultPrevented, true);
  assert.equal(fixture.listbox.hidden, false);
  assert.equal(fixture.options[1].focused, true);

  const moveEvent = keyboardEvent("ArrowDown");
  fixture.options[1].emit("keydown", moveEvent);
  assert.equal(moveEvent.defaultPrevented, true);
  assert.equal(fixture.options[2].focused, true);

  fixture.options[2].emit("keydown", keyboardEvent("Enter"));
  assert.equal(fixture.select.value, "de");
  assert.equal(fixture.listbox.hidden, true);
});

test("language picker closes when focus leaves it", () => {
  const fixture = createFixture();

  fixture.button.emit("click");
  fixture.root.emit("focusout", { relatedTarget: {} });

  assert.equal(fixture.listbox.hidden, true);
  assert.equal(fixture.button.getAttribute("aria-expanded"), "false");
});
