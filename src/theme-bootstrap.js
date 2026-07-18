// Apply the system theme before CSS loads. The persisted preference is applied
// by main.js after the user configuration becomes available.
const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
