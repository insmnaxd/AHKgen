export function createLanguagePicker({ documentLike, select, EventClass = Event }) {
  const root = documentLike.querySelector("#language-picker");
  const button = documentLike.querySelector("#language-picker-button");
  const listbox = documentLike.querySelector("#language-picker-options");
  const currentFlag = documentLike.querySelector("#language-picker-current-flag");
  const currentLabel = documentLike.querySelector("#language-picker-current-label");
  const options = Array.from(listbox.querySelectorAll("[data-language]"));

  function selectedIndex() {
    const index = options.findIndex((option) => option.dataset.language === select.value);
    return index >= 0 ? index : 0;
  }

  function sync() {
    const selected = options[selectedIndex()];
    const flag = selected.querySelector("img");
    const label = selected.querySelector("span");

    currentFlag.src = flag.src;
    currentLabel.textContent = label.textContent;
    options.forEach((option) => {
      option.setAttribute(
        "aria-selected",
        option.dataset.language === selected.dataset.language ? "true" : "false"
      );
    });
  }

  function open(focusIndex = selectedIndex()) {
    listbox.hidden = false;
    button.setAttribute("aria-expanded", "true");
    options[focusIndex]?.focus();
  }

  function close({ focusButton = false } = {}) {
    listbox.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (focusButton) button.focus();
  }

  function choose(option) {
    select.value = option.dataset.language;
    select.dispatchEvent(new EventClass("change", { bubbles: true }));
    sync();
    close({ focusButton: true });
  }

  function moveFocus(currentIndex, offset) {
    const nextIndex = (currentIndex + offset + options.length) % options.length;
    options[nextIndex].focus();
  }

  function init() {
    button.addEventListener("click", () => {
      if (listbox.hidden) open();
      else close();
    });
    button.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) return;
      event.preventDefault();
      const offset = event.key === "ArrowUp" ? -1 : 0;
      open((selectedIndex() + offset + options.length) % options.length);
    });

    options.forEach((option, index) => {
      option.addEventListener("click", () => choose(option));
      option.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          moveFocus(index, event.key === "ArrowDown" ? 1 : -1);
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          options[event.key === "Home" ? 0 : options.length - 1].focus();
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          choose(option);
        } else if (event.key === "Escape") {
          event.preventDefault();
          close({ focusButton: true });
        }
      });
    });

    select.addEventListener("change", sync);
    root.addEventListener("focusout", (event) => {
      if (!root.contains(event.relatedTarget)) close();
    });
    documentLike.addEventListener("pointerdown", (event) => {
      if (!listbox.hidden && !root.contains(event.target)) close();
    });
    sync();
  }

  return { init, sync };
}
