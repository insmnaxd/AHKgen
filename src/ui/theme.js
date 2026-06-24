export function getSystemTheme(windowLike) {
  return windowLike.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function createThemeController({
  documentLike,
  windowLike,
  toggle,
  getSavedTheme,
  saveTheme,
}) {
  function apply(theme) {
    documentLike.documentElement.setAttribute("data-theme", theme);
    toggle.checked = theme === "dark";
  }

  function handleToggle() {
    const theme = toggle.checked ? "dark" : "light";
    apply(theme);
    saveTheme(theme);
  }

  function init() {
    const savedTheme = getSavedTheme();
    if (savedTheme === "light" || savedTheme === "dark") {
      apply(savedTheme);
      return;
    }

    apply(getSystemTheme(windowLike));
    windowLike.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
      if (!getSavedTheme()) {
        apply(event.matches ? "dark" : "light");
      }
    });
  }

  toggle.addEventListener("change", handleToggle);

  return {
    init,
    apply,
    handleToggle,
  };
}
