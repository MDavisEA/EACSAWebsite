// Auto-indent for student Java / Processing code.
//
// Deliberately NOT CodeMirror's indentSelection: that indents an opening brace
// on its own line as a continuation of the statement above (and the body
// twice), which is not how this class writes code. Here a `{` or `}` on its
// own line lines up with the statement that owns it, and the body sits one
// level (4 spaces) in:
//
//   for (int i = 0; i < 10; i++)
//   {
//       int j = 0;
//   }
//
// It only ever changes each line's LEADING whitespace, so nothing else in the
// student's code is touched and the cursor stays where it was.

const UNIT = 4;

// Blanks out strings, chars and comments so braces/parens inside them are not
// counted. `inBlock` carries a /* ... */ comment across lines.
function scrub(line, inBlock) {
  let out = "";
  let i = 0;
  let block = inBlock;
  while (i < line.length) {
    const c = line[i];
    const n = line[i + 1];
    if (block) {
      if (c === "*" && n === "/") { block = false; i += 2; } else i += 1;
      out += " ";
      continue;
    }
    if (c === "/" && n === "*") { block = true; i += 2; out += " "; continue; }
    if (c === "/" && n === "/") break;
    if (c === '"' || c === "'") {
      const q = c;
      i += 1;
      while (i < line.length && line[i] !== q) i += line[i] === "\\" ? 2 : 1;
      i += 1;
      out += "_";
      continue;
    }
    out += c;
    i += 1;
  }
  return { code: out, inBlock: block };
}

const HEADER = /^(?:\}\s*)?(?:(?:if|for|while)\b|else\s+if\b)/;

// Returns the text with every line's leading whitespace fixed.
export function reindentJava(text) {
  const lines = text.split("\n");
  const result = [];
  let depth = 0; // open { blocks
  let parenOpen = 0; // unclosed ( carried across lines
  let inBlock = false;
  let pendingBody = false; // previous line was a bare if/for/while/else header
  let headerIndent = 0;

  for (const raw of lines) {
    const trimmed = raw.trim();
    const startedInBlock = inBlock;
    const { code, inBlock: nextBlock } = scrub(raw, inBlock);
    inBlock = nextBlock;
    const stripped = code.trim();

    if (trimmed === "") { result.push(""); continue; }

    // Inside a block comment: line up under the code, ` *` lines one space in.
    if (startedInBlock) {
      result.push(" ".repeat(depth * UNIT + (trimmed.startsWith("*") ? 1 : 0)) + trimmed);
      continue;
    }

    const leadingClosers = (stripped.match(/^\}+/) || [""])[0].length;
    let level = Math.max(0, depth - leadingClosers);
    let indent;
    if (parenOpen > 0) {
      indent = (level + 2) * UNIT; // wrapped condition / argument list
    } else if (pendingBody && !stripped.startsWith("{")) {
      indent = headerIndent + UNIT; // one-line body with no braces
    } else {
      indent = level * UNIT;
    }
    result.push(" ".repeat(indent) + trimmed);

    // Update running state from this line.
    let opens = 0;
    let closes = 0;
    let p = parenOpen;
    for (const ch of stripped) {
      if (ch === "{") opens += 1;
      else if (ch === "}") closes += 1;
      else if (ch === "(") p += 1;
      else if (ch === ")") p = Math.max(0, p - 1);
    }
    const wasBody = pendingBody && !stripped.startsWith("{");
    depth = Math.max(0, depth + opens - closes);
    const startedWrapped = parenOpen > 0;
    parenOpen = p;

    pendingBody = false;
    if (!startedWrapped && parenOpen === 0 && !wasBody) {
      const bareElse = /^(?:\}\s*)?else$/.test(stripped);
      const header = HEADER.test(stripped) && stripped.endsWith(")");
      if (header || bareElse) {
        pendingBody = true;
        headerIndent = indent;
      }
    } else if (wasBody && /^(?:if|for|while)\b/.test(stripped) && stripped.endsWith(")")) {
      // A braceless body that is itself a header (nested single-line if).
      pendingBody = true;
      headerIndent = indent;
    }
  }
  return result.join("\n");
}

// Applies reindentJava to a live CodeMirror view as a minimal edit (leading
// whitespace only), so the selection maps through and undo works.
export function autoIndentView(view) {
  const doc = view.state.doc;
  const before = doc.toString();
  const after = reindentJava(before);
  if (after === before) return;
  const newLines = after.split("\n");
  const changes = [];
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const oldLead = line.text.length - line.text.trimStart().length;
    const newLead = newLines[n - 1].length - newLines[n - 1].trimStart().length;
    const want = newLines[n - 1].slice(0, newLead);
    if (line.text.slice(0, oldLead) !== want) {
      changes.push({ from: line.from, to: line.from + oldLead, insert: want });
    }
  }
  if (changes.length) view.dispatch({ changes, scrollIntoView: true });
}
