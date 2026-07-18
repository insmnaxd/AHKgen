export function createEntryListUi({
  windowLike,
  requestAnimationFrameFn = windowLike.requestAnimationFrame.bind(windowLike),
}) {
  function expand(item, animate = true) {
    const description = item.querySelector(".hotkey-desc");
    if (!description) return;

    item.classList.remove("collapsing");
    description.classList.add("measuring");
    const expandedHeight = description.scrollHeight;
    description.classList.remove("measuring");
    description.style.maxHeight = animate
      ? `${description.offsetHeight}px`
      : `${expandedHeight}px`;
    item.classList.add("expanded");

    if (animate) {
      requestAnimationFrameFn(() => {
        description.style.maxHeight = `${expandedHeight}px`;
      });
    }
  }

  function collapse(item) {
    const description = item.querySelector(".hotkey-desc");
    if (!description) return;

    description.style.maxHeight = `${description.scrollHeight}px`;
    item.classList.remove("expanded");
    item.classList.add("collapsing");
    description.addEventListener(
      "transitionend",
      (event) => {
        if (
          event.propertyName !== "max-height" ||
          item.classList.contains("expanded")
        ) {
          return;
        }
        item.classList.remove("collapsing");
        description.style.maxHeight = "26px";
      },
      { once: true }
    );

    requestAnimationFrameFn(() => {
      description.style.maxHeight = "26px";
    });
  }

  function setup(list, handleEdit) {
    list.querySelectorAll(".hotkey-item-expandable").forEach((item) => {
      const description = item.querySelector(".hotkey-desc");
      if (description && item.classList.contains("editing")) {
        expand(item, false);
      }

      item.querySelector(".entry-edit-button")?.addEventListener("click", () => {
        handleEdit(Number.parseInt(item.dataset.index, 10));
      });
      item.addEventListener("mouseenter", () => {
        if (description) expand(item);
      });
      item.addEventListener("mouseleave", () => {
        if (description && !item.classList.contains("editing")) collapse(item);
      });
    });
  }

  function setEditing(list, index) {
    list.querySelectorAll(".hotkey-item-expandable").forEach((item) => {
      const isEdited = Number.parseInt(item.dataset.index, 10) === index;
      item.classList.toggle("editing", isEdited);

      if (isEdited && !item.classList.contains("expanded")) {
        expand(item);
      } else if (
        !isEdited &&
        item.classList.contains("expanded") &&
        !item.matches(":hover")
      ) {
        collapse(item);
      }
    });
  }

  function clearEditing(list, index) {
    if (index === null) return;
    const item = list.querySelector(`[data-index="${index}"]`);
    if (!item) return;

    item.classList.remove("editing");
    collapse(item);
  }

  function prefersReducedMotion() {
    return windowLike.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function add(list, index, replacedEmptyState = false) {
    const item = list.querySelector(`[data-index="${index}"]`);
    if (!item || !item.animate || prefersReducedMotion()) return;

    list.classList.add("animating-entry");
    const height = item.getBoundingClientRect().height;
    const startFrame = replacedEmptyState
      ? {
          height: `${height}px`,
          marginBottom: "8px",
          paddingTop: "10px",
          paddingBottom: "10px",
          opacity: 0,
          transform: "translateY(6px)",
        }
      : {
          height: "0px",
          marginBottom: "0px",
          paddingTop: "0px",
          paddingBottom: "0px",
          opacity: 0,
          transform: "translateY(-8px)",
        };
    const animation = item.animate(
      [
        startFrame,
        {
          height: `${height}px`,
          marginBottom: "8px",
          paddingTop: "10px",
          paddingBottom: "10px",
          opacity: 1,
          transform: "translateY(0)",
        },
      ],
      {
        duration: 320,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      }
    );

    animation.finished
      .catch(() => {})
      .finally(() => list.classList.remove("animating-entry"));
  }

  function remove(item, removeEntry, revealsEmptyState = false) {
    if (!item || !item.animate || prefersReducedMotion()) {
      removeEntry();
      return;
    }

    item.style.pointerEvents = "none";
    item.style.overflow = "hidden";
    const height = item.getBoundingClientRect().height;
    const endFrame = revealsEmptyState
      ? {
          height: `${height}px`,
          marginBottom: "8px",
          paddingTop: "10px",
          paddingBottom: "10px",
          opacity: 0,
          transform: "translateY(-6px)",
        }
      : {
          height: "0px",
          marginBottom: "0px",
          paddingTop: "0px",
          paddingBottom: "0px",
          opacity: 0,
          transform: "translateY(-6px)",
        };
    const animation = item.animate(
      [
        {
          height: `${height}px`,
          marginBottom: "8px",
          paddingTop: "10px",
          paddingBottom: "10px",
          opacity: 1,
          transform: "translateY(0)",
        },
        endFrame,
      ],
      {
        duration: 280,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        fill: "forwards",
      }
    );

    animation.finished.then(removeEntry).catch(removeEntry);
  }

  function empty(list) {
    const emptyState = list.querySelector(".empty-state");
    if (!emptyState || !emptyState.animate || prefersReducedMotion()) return;

    emptyState.animate(
      [
        { opacity: 0, transform: "translateY(5px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      {
        duration: 220,
        easing: "ease-out",
      }
    );
  }

  return {
    editableEntries: { setup, setEditing, clearEditing },
    animations: { add, remove, empty },
  };
}
