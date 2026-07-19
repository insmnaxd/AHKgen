const ENTERING_CLASS = "message-entering";
const LEAVING_CLASS = "message-leaving";

export function setAnimatedMessage(element, message) {
  element.textContent = message;
  if (!message || !element.classList) return;

  element.classList.remove(ENTERING_CLASS, LEAVING_CLASS);
  void element.offsetWidth;
  element.classList.add(ENTERING_CLASS);
}

export function startMessageExit(element) {
  if (!element.textContent || !element.classList) return;

  element.classList.remove(ENTERING_CLASS);
  element.classList.add(LEAVING_CLASS);
}
