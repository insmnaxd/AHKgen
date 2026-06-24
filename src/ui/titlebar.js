const MAXIMIZE_ICON =
  '<svg viewBox="0 0 10 10" width="10" height="10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1" /></svg>';
const RESTORE_ICON =
  '<svg viewBox="0 0 10 10" width="10" height="10"><rect x="2.5" y="0.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1" /><rect x="0.5" y="2.5" width="7" height="7" fill="var(--bg)" stroke="currentColor" stroke-width="1" /></svg>';

export function injectVersion(documentLike, version) {
  const versionTag = documentLike.querySelector(".version-tag");
  if (versionTag) versionTag.textContent = version;
}

export function createTitlebarController({ documentLike, appWindow, t }) {
  const titlebar = documentLike.querySelector(".titlebar");
  const minimizeButton = documentLike.querySelector("#titlebar-minimize");
  const maximizeButton = documentLike.querySelector("#titlebar-maximize");
  const closeButton = documentLike.querySelector("#titlebar-close");

  function updateMaximizeLabel() {
    if (!maximizeButton.dataset.maximized) return;
    const key =
      maximizeButton.dataset.maximized === "true"
        ? "titlebar.restore"
        : "titlebar.maximize";
    maximizeButton.title = t(key);
    maximizeButton.setAttribute("aria-label", maximizeButton.title);
  }

  function setMaximized(isMaximized) {
    maximizeButton.innerHTML = isMaximized ? RESTORE_ICON : MAXIMIZE_ICON;
    maximizeButton.dataset.maximized = isMaximized ? "true" : "false";
    updateMaximizeLabel();
  }

  function init() {
    minimizeButton.addEventListener("click", () => appWindow.minimize());
    maximizeButton.addEventListener("click", () => appWindow.toggleMaximize());
    closeButton.addEventListener("click", () => appWindow.close());

    appWindow.isMaximized().then(setMaximized);
    appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    });

    titlebar.addEventListener("dblclick", (event) => {
      if (!event.target.closest(".titlebar-btn")) {
        appWindow.toggleMaximize();
      }
    });
  }

  return {
    init,
    updateMaximizeLabel,
    setMaximized,
  };
}
