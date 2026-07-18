export function createModesController({ documentLike, onSwitch }) {
  const tabs = documentLike.querySelectorAll(".mode-tab");
  const sections = {
    hotkeys: [
      documentLike.querySelector("#mode-section-hotkeys"),
      documentLike.querySelector("#list-section-hotkeys"),
    ],
    hotstrings: [
      documentLike.querySelector("#mode-section-hotstrings"),
      documentLike.querySelector("#list-section-hotstrings"),
    ],
    remap: [
      documentLike.querySelector("#mode-section-remap"),
      documentLike.querySelector("#list-section-remap"),
    ],
    settings: [documentLike.querySelector("#mode-section-settings")],
  };
  const preview = documentLike.querySelector("#script-preview-section");

  function activateTab(tab, focus = false) {
    switchTo(tab.dataset.mode);
    if (focus) tab.focus();
  }

  function switchTo(mode) {
    tabs.forEach((tab) => {
      const isActive = tab.dataset.mode === mode;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });
    for (const [sectionMode, elements] of Object.entries(sections)) {
      elements.forEach((element) => {
        const isHidden = sectionMode !== mode;
        element.classList.toggle("hidden", isHidden);
        element.setAttribute("aria-hidden", String(isHidden));
      });
    }
    const isPreviewHidden = mode === "settings";
    preview.classList.toggle("hidden", isPreviewHidden);
    preview.setAttribute("aria-hidden", String(isPreviewHidden));
    onSwitch(mode);
  }

  function init() {
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activateTab(tab));
      tab.addEventListener("keydown", (event) => {
        let nextIndex = null;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;
        if (nextIndex === null) return;

        event.preventDefault();
        activateTab(tabs[nextIndex], true);
      });
    });
  }

  return { init, switchTo };
}
