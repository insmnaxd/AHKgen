function escapeSendKeys(text) {
  return text
    .replace(/[{}]/g, (char) => (char === "{" ? "{{}" : "{}}"))
    .replace(/\^/g, "{^}")
    .replace(/!/g, "{!}")
    .replace(/\+/g, "{+}")
    .replace(/#/g, "{#}")
    .replace(/\t/g, "{Tab}")
    .replace(/^ +| +$/g, (spaces) => "{Space}".repeat(spaces.length))
    .replace(/\r\n|\r|\n/g, "+{Enter}");
}

function unescapeSendKeys(text) {
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
    .replace(/\{#\}/g, "#");
}

// Backticks must be escaped first so the ones added for literal percent signs
// are not escaped a second time.
export function escapeForSend(text) {
  return escapeSendKeys(text.replace(/`/g, "``").replace(/%/g, "`%"));
}

export function unescapeFromSend(text) {
  return unescapeSendKeys(text)
    // Decode escaped percent signs before doubled backticks. Otherwise a
    // literal backtick immediately followed by "%" would lose its backtick.
    .replace(/`%/g, "%")
    .replace(/``/g, "`");
}

export function escapeForV2Send(text) {
  return escapeForV2ExpressionString(escapeSendKeys(text));
}

export function unescapeFromV2Send(text) {
  return unescapeSendKeys(unescapeFromExpressionString(text));
}

// AHK v1 uses doubled quotes inside a quoted Run target. Percent signs start
// legacy variable references, while commas separate command parameters.
export function escapeForRun(text) {
  return text
    .replace(/`/g, "``")
    .replace(/%/g, "`%")
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
    .replace(/`%/g, "%")
    .replace(/`,/g, ",")
    .replace(/``/g, "`");
}

export function escapeForExpressionString(text) {
  return text
    .replace(/`/g, "``")
    .replace(/"/g, '""')
    .replace(/\r\n|\r|\n/g, "`n")
    .replace(/\t/g, "`t");
}

export function escapeForV2ExpressionString(text) {
  return text
    .replace(/`/g, "``")
    .replace(/"/g, '`"')
    .replace(/\r\n|\r|\n/g, "`n")
    .replace(/\t/g, "`t");
}

export function unescapeFromExpressionString(text) {
  const escapeSequences = {
    a: "\u0007",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
  };
  let result = "";

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"' && next === '"') {
      result += '"';
      index++;
    } else if (character === "`" && next !== undefined) {
      result += escapeSequences[next] ?? next;
      index++;
    } else {
      result += character;
    }
  }

  return result;
}

// Kept for parsing legacy static definitions generated before Hotstring()
// became the output format. New definitions use expression-string escaping.
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
