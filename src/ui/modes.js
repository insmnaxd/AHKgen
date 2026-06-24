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

  function switchTo(mode) {
    tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.mode === mode);
    });
    for (const [sectionMode, elements] of Object.entries(sections)) {
      elements.forEach((element) => {
        element.classList.toggle("hidden", sectionMode !== mode);
      });
    }
    preview.classList.toggle("hidden", mode === "settings");
    onSwitch(mode);
  }

  function init() {
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => switchTo(tab.dataset.mode));
    });
  }

  return { init, switchTo };
}
