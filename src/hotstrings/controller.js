import {
  createHotstringEntry,
  getHotstringOptionTags,
  validateHotstringEntry,
} from "./model.js";

export function createHotstringsController({
  documentLike,
  entries,
  t,
  escapeHtml,
  editableEntries,
  animations,
  onChange,
}) {
  const elements = {
    trigger: documentLike.querySelector("#hotstring-trigger-input"),
    replacement: documentLike.querySelector("#hotstring-replacement-input"),
    autoReplace: documentLike.querySelector("#hotstring-opt-auto"),
    caseSensitive: documentLike.querySelector("#hotstring-opt-case"),
    insideWord: documentLike.querySelector("#hotstring-opt-inside"),
    rawText: documentLike.querySelector("#hotstring-opt-raw"),
    comment: documentLike.querySelector("#hotstring-comment-input"),
    addButton: documentLike.querySelector("#add-hotstring-btn"),
    cancelButton: documentLike.querySelector("#cancel-hotstring-edit-btn"),
    error: documentLike.querySelector("#hotstring-form-error"),
    formTitle: documentLike.querySelector("#hotstring-form-title"),
    list: documentLike.querySelector("#hotstring-list"),
    count: documentLike.querySelector("#hotstring-count"),
  };

  let editingIndex = null;

  function readForm() {
    return createHotstringEntry({
      trigger: elements.trigger.value,
      replacement: elements.replacement.value,
      autoReplace: elements.autoReplace.checked,
      caseSensitive: elements.caseSensitive.checked,
      insideWord: elements.insideWord.checked,
      rawText: elements.rawText.checked,
      comment: elements.comment.value,
    });
  }

  function resetForm() {
    elements.trigger.value = "";
    elements.replacement.value = "";
    elements.autoReplace.checked = false;
    elements.caseSensitive.checked = false;
    elements.insideWord.checked = false;
    elements.rawText.checked = false;
    elements.comment.value = "";
  }

  function clearError() {
    elements.error.textContent = "";
  }

  function updateLabels() {
    elements.formTitle.textContent = t(
      editingIndex === null ? "form.hotstring.new" : "form.hotstring.edit"
    );
    elements.addButton.textContent = t(
      editingIndex === null ? "button.addHotstring" : "button.saveChanges"
    );
  }

  function startEdit(index) {
    const hotstring = entries[index];
    editingIndex = index;

    elements.trigger.value = hotstring.trigger;
    elements.replacement.value = hotstring.replacement;
    elements.autoReplace.checked = hotstring.autoReplace;
    elements.caseSensitive.checked = hotstring.caseSensitive;
    elements.insideWord.checked = hotstring.insideWord;
    elements.rawText.checked = hotstring.rawText;
    elements.comment.value = hotstring.comment || "";

    elements.cancelButton.classList.remove("hidden");
    clearError();
    updateLabels();
    editableEntries.setEditing(elements.list, index);
  }

  function cancelEdit() {
    const cancelledIndex = editingIndex;
    editingIndex = null;
    resetForm();
    elements.cancelButton.classList.add("hidden");
    clearError();
    updateLabels();
    editableEntries.clearEditing(elements.list, cancelledIndex);
  }

  function render() {
    elements.count.textContent = entries.length;

    if (entries.length === 0) {
      elements.list.innerHTML = `<li class="empty-state">${escapeHtml(
        t("empty.hotstrings")
      )}</li>`;
      return;
    }

    elements.list.innerHTML = entries
      .map((hotstring, index) => {
        const editingClass = index === editingIndex ? " editing" : "";
        const optionTags = getHotstringOptionTags(hotstring);
        const optionsLabel =
          optionTags.length > 0
            ? ` <span class="hotstring-options">[${optionTags.join(" ")}]</span>`
            : "";
        const description = hotstring.comment
          ? `<span class="hotkey-desc hotkey-entry-name"><strong>${escapeHtml(
              hotstring.comment
            )}</strong></span>`
          : `<span class="hotkey-desc"><strong>${escapeHtml(
              hotstring.replacement
            )}</strong>${optionsLabel}</span>`;

        return `
          <li class="hotkey-item hotkey-item-expandable hotstring-entry${editingClass}" data-index="${index}" tabindex="-1">
            <div class="hotkey-item-main">
              <span class="entry-prefix">
                <span class="hotkey-badge">${escapeHtml(hotstring.trigger)}</span>
                ${hotstring.comment ? "" : '<span class="remap-arrow-inline">&rarr;</span>'}
              </span>
              ${description}
            </div>
            <div class="hotkey-item-actions">
              <button class="btn-remove-hotstring" data-index="${index}" title="${escapeHtml(
                t("button.remove")
              )}">&times;</button>
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

    elements.list.querySelectorAll(".btn-remove-hotstring").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const index = Number.parseInt(button.dataset.index, 10);
        const removingLastEntry = entries.length === 1;

        animations.remove(
          button.closest(".hotkey-item"),
          () => {
            entries.splice(index, 1);
            if (editingIndex !== null) cancelEdit();
            onChange();
            if (removingLastEntry) animations.empty(elements.list);
          },
          removingLastEntry
        );
      });
    });
  }

  function addOrSave() {
    clearError();
    const candidate = readForm();
    const validation = validateHotstringEntry(entries, candidate, editingIndex);

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
      resetForm();
    }

    onChange();
    if (addedIndex !== null) {
      animations.add(elements.list, addedIndex, addedIndex === 0);
    }
  }

  function init() {
    elements.addButton.addEventListener("click", addOrSave);
    elements.cancelButton.addEventListener("click", cancelEdit);
    updateLabels();
  }

  return {
    init,
    render,
    updateLabels,
    cancelEdit,
    isEditing: () => editingIndex !== null,
  };
}
