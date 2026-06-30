import {
  MOUSE_LAYOUT,
  STANDARD_KEYBOARD_LAYOUT,
} from "../keyboard/visual-layout.js";
import { escapeHtml } from "./html.js";

function renderKey(definition) {
  const classes = ["kb-key"];
  const styles = [];
  if (definition.modifier) classes.push("kb-modifier");
  if (definition.className) classes.push(definition.className);
  if (definition.area) classes.push(`mouse-key-${definition.area}`);

  const attributes = [
    'type="button"',
    `class="${classes.join(" ")}"`,
    `data-key="${escapeHtml(definition.key)}"`,
  ];

  if (definition.side) attributes.push(`data-side="${definition.side}"`);
  if (definition.base) attributes.push(`data-base="${definition.base}"`);
  if (definition.title) {
    attributes.push(`title="${escapeHtml(definition.title)}"`);
    attributes.push(`aria-label="${escapeHtml(definition.title)}"`);
  }
  if (definition.span) styles.push(`--key-span: ${definition.span}`);
  if (definition.column) {
    attributes.push(`data-column="${definition.column}"`);
    styles.push(
      `grid-column: ${definition.column} / span ${definition.span || 1}`
    );
  }
  if (definition.row) {
    attributes.push(`data-row="${definition.row}"`);
    styles.push(
      `grid-row: ${definition.row} / span ${definition.rowSpan || 1}`
    );
  }
  if (definition.rowSpan) {
    attributes.push(`data-row-span="${definition.rowSpan}"`);
  }
  if (styles.length) attributes.push(`style="${styles.join("; ")}"`);

  return `<button ${attributes.join(" ")}>${escapeHtml(definition.label)}</button>`;
}

function renderRows(rows) {
  return rows
    .map((row, index) => {
      const content = row
        .map((definition) => {
          if (!definition.spacer) return renderKey(definition);
          return `<span class="kb-spacer" style="--key-span: ${definition.span}" aria-hidden="true"></span>`;
        })
        .join("");
      return `<div class="kb-grid-row" data-row="${index + 1}">${content}</div>`;
    })
    .join("");
}

function renderRowGrid(definition, className) {
  return `<div class="${className}" style="--grid-columns: ${definition.columns}">${renderRows(definition.rows)}</div>`;
}

function renderPositionedGrid(definition, className) {
  return `<div class="${className}" style="--grid-columns: ${definition.columns}">${definition.keys
    .map(renderKey)
    .join("")}</div>`;
}

export function buildVisualInputHtml() {
  const keyboard = STANDARD_KEYBOARD_LAYOUT;
  const mouseKeys = MOUSE_LAYOUT.map(renderKey).join("");

  return `
    <div class="visual-input-devices">
      <div class="keyboard-scroll">
        <div class="standard-keyboard">
          <div class="keyboard-top">
            ${renderRowGrid(keyboard.functionRow.main, "keyboard-function-main")}
            ${renderRowGrid(keyboard.functionRow.system, "keyboard-system")}
            <div aria-hidden="true"></div>
          </div>
          <div class="keyboard-body">
            ${renderRowGrid(keyboard.main, "keyboard-main")}
            ${renderRowGrid(keyboard.navigation, "keyboard-navigation")}
            ${renderPositionedGrid(keyboard.numpad, "keyboard-numpad")}
          </div>
        </div>
      </div>
      <section class="mouse-device" aria-label="Mouse">
        <div class="mouse-device-title" data-i18n="device.mouse">Mouse</div>
        <div class="mouse-shell">${mouseKeys}</div>
      </section>
    </div>`;
}

export function renderVisualInputPicker(container) {
  if (!container) throw new Error("Visual input container was not found.");
  container.innerHTML = buildVisualInputHtml();
}
