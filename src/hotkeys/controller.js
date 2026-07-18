import {
  buildPrefix,
  isModifierActive,
  parsePrefix,
  toggleModifierInSet,
} from "../keyboard/prefixes.js";
import {
  ACTION_CONFIG,
  createHotkeyEntry,
  validateHotkeyEntry,
} from "./model.js";
import { applyKeyboardLayoutToButton } from "../keyboard/layouts.js";
import { removeEntryByReference } from "../ui/entries.js";

export function createHotkeysController({
  documentLike,
  entries,
  t,
  escapeHtml,
  getDistinguishSides,
  editableEntries,
  animations,
  inputCapture,
  browseForFile,
  onBrowseError,
  onChange,
}) {
  const elements = {
    keyboard: documentLike.querySelector("#keyboard"),
    selectedDisplay: documentLike.querySelector("#selected-hotkey-display"),
    clearButton: documentLike.querySelector("#clear-hotkey-btn"),
    formTitle: documentLike.querySelector("#form-title"),
    actionType: documentLike.querySelector("#action-type"),
    actionValueLabel: documentLike.querySelector("#action-value-label"),
    actionValueHint: documentLike.querySelector("#action-value-hint"),
    browseButton: documentLike.querySelector("#browse-file-btn"),
    sendModeToggle: documentLike.querySelector("#send-mode-event-toggle"),
    sendModeGroup: documentLike.querySelector("#send-mode-group"),
    comment: documentLike.querySelector("#comment-input"),
    addButton: documentLike.querySelector("#add-hotkey-btn"),
    cancelButton: documentLike.querySelector("#cancel-edit-btn"),
    error: documentLike.querySelector("#form-error"),
    list: documentLike.querySelector("#hotkey-list"),
    count: documentLike.querySelector("#hotkey-count"),
  };

  let actionValue = documentLike.querySelector("#action-value");
  let selectedModifiers = new Set();
  let selectedKey = null;
  let editingIndex = null;
  let layoutMap = {};

  function getPrefix() {
    return createHotkeyEntry({
      modifiers: selectedModifiers,
      key: selectedKey,
      distinguishSides: getDistinguishSides(),
    }).prefix;
  }

  function updateVisuals() {
    const distinguishSides = getDistinguishSides();
    elements.keyboard.querySelectorAll(".kb-key").forEach((button) => {
      const key = button.dataset.key;
      if (button.classList.contains("kb-modifier")) {
        button.classList.toggle(
          "active",
          isModifierActive(
            key,
            button.dataset.base,
            selectedModifiers,
            distinguishSides
          )
        );
      } else {
        button.classList.toggle("active", selectedKey === key);
      }
    });
  }

  function updateDisplay() {
    renderDisplay(
      selectedModifiers,
      selectedKey,
      t("placeholder.selectedHotkey")
    );
  }

  function renderDisplay(modifiers, key, fallback, suffix = "") {
    const modifierText = buildPrefix(
      modifiers,
      null,
      getDistinguishSides()
    );
    if (!modifierText && !key) {
      elements.selectedDisplay.innerHTML = `<span class="combination-placeholder">${escapeHtml(
        fallback
      )}</span>`;
      return;
    }

    elements.selectedDisplay.innerHTML = [
      modifierText
        ? `<span class="combination-modifiers">${escapeHtml(
            modifierText
          )}</span>`
        : "",
      key
        ? `<span class="combination-key">${escapeHtml(key)}</span>`
        : "",
      suffix
        ? `<span class="combination-suffix">${escapeHtml(suffix)}</span>`
        : "",
    ].join("");
  }

  function toggleModifier(modifierKey) {
    toggleModifierInSet(
      selectedModifiers,
      modifierKey,
      getDistinguishSides()
    );
    updateVisuals();
    updateDisplay();
  }

  function selectKey(key) {
    selectedKey = selectedKey === key ? null : key;
    updateVisuals();
    updateDisplay();
  }

  function clearModifiers() {
    selectedModifiers.clear();
    updateVisuals();
    updateDisplay();
  }

  function clearSelection() {
    selectedModifiers = new Set();
    selectedKey = null;
    updateVisuals();
    updateDisplay();
  }

  function clearError() {
    elements.error.textContent = "";
  }

  function updateLabels() {
    elements.formTitle.textContent = t(
      editingIndex === null ? "form.hotkey.new" : "form.hotkey.edit"
    );
    elements.addButton.textContent = t(
      editingIndex === null ? "button.addHotkey" : "button.saveChanges"
    );
  }

  function updateActionFields() {
    const config = ACTION_CONFIG[elements.actionType.value];
    const isSendText = elements.actionType.value === "send";
    const currentlyTextarea = actionValue.tagName === "TEXTAREA";

    if (isSendText !== currentlyTextarea) {
      const oldValue = actionValue.value;
      const newElement = documentLike.createElement(
        isSendText ? "textarea" : "input"
      );
      newElement.id = "action-value";
      if (isSendText) {
        newElement.rows = 4;
      } else {
        newElement.type = "text";
      }
      newElement.value = oldValue;
      actionValue.replaceWith(newElement);
      actionValue = newElement;
    }

    elements.actionValueLabel.textContent = t(config.labelKey);
    actionValue.placeholder = t(config.placeholderKey);
    elements.actionValueHint.textContent = t(config.hintKey);
    elements.browseButton.classList.toggle(
      "hidden",
      elements.actionType.value !== "run"
    );
    elements.sendModeGroup.classList.toggle("hidden", !isSendText);
  }

  function updateTranslations() {
    updateLabels();
    updateActionFields();
  }

  function startEdit(index) {
    const hotkey = entries[index];
    editingIndex = index;

    const parsed = parsePrefix(hotkey.prefix);
    selectedModifiers = parsed.mods;
    selectedKey = parsed.key;
    updateVisuals();
    updateDisplay();

    elements.actionType.value = hotkey.actionType;
    updateActionFields();
    actionValue.value = hotkey.actionValue;
    elements.sendModeToggle.checked = hotkey.sendMode === "Event";
    elements.comment.value = hotkey.comment || "";

    elements.cancelButton.classList.remove("hidden");
    clearError();
    updateLabels();
    editableEntries.setEditing(elements.list, index);
  }

  function cancelEdit() {
    const cancelledIndex = editingIndex;
    editingIndex = null;
    clearSelection();
    elements.actionType.value = "send";
    updateActionFields();
    actionValue.value = "";
    elements.sendModeToggle.checked = false;
    elements.comment.value = "";
    elements.cancelButton.classList.add("hidden");
    clearError();
    updateLabels();
    editableEntries.clearEditing(elements.list, cancelledIndex);
  }

  function render() {
    elements.count.textContent = entries.length;

    if (entries.length === 0) {
      elements.list.innerHTML = `<li class="empty-state">${escapeHtml(
        t("empty.hotkeys")
      )}</li>`;
      return;
    }

    elements.list.innerHTML = entries
      .map((hotkey, index) => {
        const actionLabel = t(ACTION_CONFIG[hotkey.actionType].labelKey);
        const editingClass = index === editingIndex ? " editing" : "";
        const sendModeTag =
          hotkey.actionType === "send" &&
          hotkey.sendMode &&
          hotkey.sendMode !== "Input"
            ? ` <span class="hotstring-options">[${escapeHtml(
                hotkey.sendMode
              )}]</span>`
            : "";
        const description = hotkey.comment
          ? `<span class="hotkey-desc hotkey-entry-name"><strong>${escapeHtml(
              hotkey.comment
            )}</strong></span>`
          : `<span class="hotkey-desc">${actionLabel}: <strong>${escapeHtml(
              hotkey.actionValue
            )}</strong>${sendModeTag}</span>`;

        return `
          <li class="hotkey-item hotkey-item-expandable hotkey-entry${editingClass}" data-index="${index}">
            <button type="button" class="hotkey-item-main entry-edit-button" aria-label="${escapeHtml(
              `${t("button.edit")}: ${hotkey.prefix}`
            )}">
              <span class="entry-prefix">
                <span class="hotkey-badge">${escapeHtml(hotkey.prefix)}</span>
              </span>
              ${description}
            </button>
            <div class="hotkey-item-actions">
              <button type="button" class="btn-remove" data-index="${index}" title="${escapeHtml(
                t("button.remove")
              )}" aria-label="${escapeHtml(t("button.remove"))}">&times;</button>
            </div>
          </li>
        `;
      })
      .join("");

    editableEntries.setup(elements.list, (index) => {
      if (editingIndex === index) {
        cancelEdit();
      } else {
        startEdit(index);
      }
    });

    elements.list.querySelectorAll(".btn-remove").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const index = Number.parseInt(button.dataset.index, 10);
        const entry = entries[index];
        const removingLastEntry = entries.length === 1;

        animations.remove(
          button.closest(".hotkey-item"),
          () => {
            if (!removeEntryByReference(entries, entry)) return;
            if (editingIndex !== null) cancelEdit();
            onChange();
            if (entries.length === 0) animations.empty(elements.list);
          },
          removingLastEntry
        );
      });
    });
  }

  function addOrSave() {
    clearError();
    const candidate = createHotkeyEntry({
      modifiers: selectedModifiers,
      key: selectedKey,
      distinguishSides: getDistinguishSides(),
      actionType: elements.actionType.value,
      actionValue: actionValue.value,
      useEventMode: elements.sendModeToggle.checked,
      comment: elements.comment.value,
    });
    const validation = validateHotkeyEntry(entries, candidate, {
      selectedKey,
      editingIndex,
    });

    if (!validation.valid) {
      elements.error.textContent = t(validation.errorKey, validation.values);
      return;
    }

    let addedIndex = null;
    if (editingIndex !== null) {
      entries[editingIndex] = candidate;
      cancelEdit();
    } else {
      entries.push(candidate);
      addedIndex = entries.length - 1;
      clearSelection();
      actionValue.value = "";
      elements.sendModeToggle.checked = false;
      elements.comment.value = "";
    }

    onChange();
    if (addedIndex !== null) {
      animations.add(elements.list, addedIndex, addedIndex === 0);
    }
  }

  async function browse() {
    try {
      const filePath = await browseForFile();
      if (filePath) actionValue.value = filePath;
    } catch (error) {
      onBrowseError(error);
    }
  }

  function applyKeyboardLayout(map) {
    layoutMap = map;
    elements.keyboard
      .querySelectorAll(".kb-key:not(.kb-modifier)")
      .forEach((button) => {
        applyKeyboardLayoutToButton(button, map);
      });
  }

  function updateModifierLabels() {
    elements.keyboard.querySelectorAll(".kb-modifier").forEach((button) => {
      const { side, base } = button.dataset;
      button.textContent =
        getDistinguishSides() && ["Ctrl", "Shift"].includes(base)
          ? `${side} ${base}`
          : base;
    });
  }

  function init() {
    inputCapture.register(elements.selectedDisplay, {
      getLayoutMap: () => layoutMap,
      onStart: () => {
        selectedModifiers = new Set();
        selectedKey = null;
        updateVisuals();
        updateDisplay();
      },
      onCancel: () => {
        selectedModifiers = new Set();
        selectedKey = null;
        updateVisuals();
      },
      onStateChange: (capturing) => {
        if (capturing) {
          renderDisplay(new Set(), null, t("capture.prompt"));
        } else {
          updateDisplay();
        }
      },
      onProgress: ({ modifiers }) => {
        selectedModifiers = modifiers;
        selectedKey = null;
        updateVisuals();
        if (modifiers.size > 0) {
          renderDisplay(modifiers, null, t("capture.prompt"), " …");
        } else {
          renderDisplay(new Set(), null, t("capture.prompt"));
        }
      },
      onCapture: ({ modifiers, key }) => {
        selectedModifiers = modifiers;
        selectedKey = key;
        updateVisuals();
        updateDisplay();
      },
    });
    elements.keyboard.querySelectorAll(".kb-key").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.classList.contains("kb-modifier")) {
          toggleModifier(button.dataset.key);
        } else {
          selectKey(button.dataset.key);
        }
      });
    });
    elements.clearButton.addEventListener("click", clearSelection);
    elements.addButton.addEventListener("click", addOrSave);
    elements.cancelButton.addEventListener("click", cancelEdit);
    elements.actionType.addEventListener("change", updateActionFields);
    elements.browseButton.addEventListener("click", browse);
    updateTranslations();
    updateDisplay();
  }

  return {
    init,
    render,
    updateTranslations,
    updateModifierLabels,
    applyKeyboardLayout,
    clearModifiers,
    clearSelection,
    cancelEdit,
    isEditing: () => editingIndex !== null,
  };
}
