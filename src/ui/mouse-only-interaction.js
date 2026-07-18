const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[contenteditable='true']",
  "[tabindex]",
].join(", ");

const MOUSE_ONLY_SELECTOR = "[data-mouse-only]";

export function shouldBlockKeyboardEvent(event) {
  if (
    event.ctrlKey &&
    !event.altKey &&
    event.key?.toLowerCase?.() === "f"
  ) {
    return true;
  }
  // Mouse-only controls are skipped while tabbing, but Tab must still be able
  // to leave one after it received focus from a mouse click.
  if (event.key === "Tab") return false;
  return Boolean(event.target?.closest?.(MOUSE_ONLY_SELECTOR));
}

export function createMouseOnlyInteraction({
  documentLike,
  MutationObserverClass,
}) {
  function removeFromTabOrder(root) {
    if (
      root.matches?.(FOCUSABLE_SELECTOR) &&
      root.closest?.(MOUSE_ONLY_SELECTOR)
    ) {
      root.setAttribute("tabindex", "-1");
    }
    root.querySelectorAll?.(FOCUSABLE_SELECTOR).forEach((element) => {
      if (element.closest?.(MOUSE_ONLY_SELECTOR)) {
        element.setAttribute("tabindex", "-1");
      }
    });
  }

  function handleKeydown(event) {
    if (!shouldBlockKeyboardEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function init() {
    removeFromTabOrder(documentLike);
    documentLike.addEventListener("keydown", handleKeydown, true);
    documentLike.addEventListener("contextmenu", handleContextMenu, true);

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
      documentLike.removeEventListener("contextmenu", handleContextMenu, true);
    };
  }

  return { init, removeFromTabOrder, handleKeydown, handleContextMenu };
}
