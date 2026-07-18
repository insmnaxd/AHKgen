export function createAutoResizeTextarea(
  textarea,
  { minHeight = 40, maxHeight = 240 } = {}
) {
  function resize() {
    textarea.style.height = "auto";

    const contentHeight = Number(textarea.scrollHeight) || minHeight;
    const nextHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }

  function init() {
    textarea.addEventListener("input", resize);
    resize();
  }

  return { init, resize };
}
