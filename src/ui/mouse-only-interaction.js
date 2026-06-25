const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[contenteditable='true']",
  "[tabindex]",
].join(", ");

const NON_TEXT_CONTROL_SELECTOR = [
  "button",
  "select",
  "input[type='checkbox']",
  "input[type='radio']",
  "input[type='button']",
  "input[type='submit']",
  "input[type='reset']",
  "[role='button']",
  "[role='tab']",
  "[role='option']",
].join(", ");

export function isTextEntryElement(element) {
  if (!element?.matches) return false;
  if (element.matches("textarea, [contenteditable='true']")) return true;
  if (!element.matches("input")) return false;

  return ![
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit",
  ].includes(element.type);
}

export function shouldBlockKeyboardEvent(event) {
  if (event.key === "Tab") return true;
  if (isTextEntryElement(event.target)) return false;
  return Boolean(event.target?.closest?.(NON_TEXT_CONTROL_SELECTOR));
}

export function createMouseOnlyInteraction({
  documentLike,
  MutationObserverClass,
}) {
  function removeFromTabOrder(root) {
    if (root.matches?.(FOCUSABLE_SELECTOR)) {
      root.setAttribute("tabindex", "-1");
    }
    root.querySelectorAll?.(FOCUSABLE_SELECTOR).forEach((element) => {
      element.setAttribute("tabindex", "-1");
    });
  }

  function handleKeydown(event) {
    if (!shouldBlockKeyboardEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function init() {
    removeFromTabOrder(documentLike);
    documentLike.addEventListener("keydown", handleKeydown, true);

    const observer = new MutationObserverClass((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) removeFromTabOrder(node);
        });
      });
    });
    observer.observe(documentLike.documentElement, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      documentLike.removeEventListener("keydown", handleKeydown, true);
    };
  }

  return { init, removeFromTabOrder, handleKeydown };
}
