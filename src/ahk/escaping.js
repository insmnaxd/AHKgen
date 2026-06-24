// Backticks must be escaped first so the ones added for literal percent signs
// are not escaped a second time.
export function escapeForSend(text) {
  return text
    .replace(/`/g, "``")
    .replace(/%/g, "`%")
    .replace(/[{}]/g, (char) => (char === "{" ? "{{}" : "{}}"))
    .replace(/\^/g, "{^}")
    .replace(/!/g, "{!}")
    .replace(/\+/g, "{+}")
    .replace(/#/g, "{#}")
    .replace(/\t/g, "{Tab}")
    .replace(/^ +| +$/g, (spaces) => "{Space}".repeat(spaces.length))
    .replace(/\r\n|\r|\n/g, "+{Enter}");
}

export function unescapeFromSend(text) {
  return text
    .replace(/\+\{Enter\}/g, "\n")
    // Decode generated whitespace tokens before literal braces. This prevents
    // escaped user text such as "{Space}" from being mistaken for a token.
    .replace(/\{Tab\}/g, "\t")
    .replace(/\{Space\}/g, " ")
    .replace(/\{\{\}/g, "{")
    .replace(/\{\}\}/g, "}")
    .replace(/\{\^\}/g, "^")
    .replace(/\{!\}/g, "!")
    .replace(/\{\+\}/g, "+")
    .replace(/\{#\}/g, "#")
    // Decode escaped percent signs before doubled backticks. Otherwise a
    // literal backtick immediately followed by "%" would lose its backtick.
    .replace(/`%/g, "%")
    .replace(/``/g, "`");
}

// AHK v1 uses doubled quotes inside a quoted Run target. Commas must be
// escaped because Run is a command whose parameters are comma-separated.
export function escapeForRun(text) {
  return text
    .replace(/`/g, "``")
    .replace(/,/g, "`,")
    .replace(/"/g, '""');
}

export function unescapeFromRun(text) {
  let result = text.trim();
  if (result.startsWith('"') && result.endsWith('"')) {
    result = result.slice(1, -1);
  }
  return result
    .replace(/""/g, '"')
    .replace(/`,/g, ",")
    .replace(/``/g, "`");
}

// A backtick makes the following character literal in AHK v1. Escaping every
// colon supports colons at the beginning/end and consecutive "::" in a trigger.
export function escapeHotstringTrigger(text) {
  return text.replace(/`/g, "``").replace(/:/g, "`:");
}

export function unescapeHotstringTrigger(text) {
  const escapeSequences = {
    a: "\u0007",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
  };

  return text.replace(/`(.)/gs, (_, char) => escapeSequences[char] ?? char);
}
