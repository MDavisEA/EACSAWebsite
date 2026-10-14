import { tokenize } from "./javaFixes.js";

// Real Processing is Java, and Java refuses to compile a statement that does not
// end in a semicolon ("Missing a semicolon"). Processing.js - what actually runs
// a sketch in the browser - translates Java to JavaScript, and JavaScript quietly
// inserts missing semicolons for you, so code that real Processing would reject
// happily runs here. This puts the rule back, so a missing semicolon stops a run
// here exactly where it would stop in Processing.
//
// It is a token scan, not a Java parser, and it is deliberately CONSERVATIVE: it
// only reports when a line ends with something that can only be the end of a
// statement and the next line clearly begins a new one. A wrong "error" here
// would stop a student running perfectly good code, so anything ambiguous
// (a line that might continue onto the next, an array initializer, a loop
// header) is let through. The cost of that caution is that a few real mistakes
// go unflagged; the cost of the opposite would be telling a student their
// correct program is broken.

// Words that cannot be the last thing in a statement, so a line ending in one is
// never "missing a semicolon" (it is waiting for what comes next).
const NOT_AN_END = new Set([
  "else", "do", "try", "finally", "return", "new", "case", "default", "class", "interface", "enum",
  "extends", "implements", "throws", "throw", "static", "final", "public", "private", "protected",
  "abstract", "instanceof", "if", "for", "while", "switch", "catch", "synchronized", "void", "import",
  "package", "assert",
  // a type on its own line, with the variable name coming on the next
  "int", "float", "double", "long", "short", "byte", "char", "boolean",
]);

// A line starting with one of these continues the statement above it.
const CONTINUES = new Set(["extends", "implements", "throws", "instanceof"]);

// Heads of `( ... )` that are followed by a statement rather than ending one.
const CONTROL = new Set(["if", "for", "while", "switch", "catch", "synchronized"]);

const isOp = (tk, s) => tk && tk.t === "op" && tk.s === s;

function matchParens(toks) {
  const openOf = {};
  const stack = [];
  toks.forEach((tk, i) => {
    if (tk.t !== "op") return;
    if (tk.s === "(" || tk.s === "{") stack.push({ s: tk.s, i });
    else if (tk.s === ")" || tk.s === "}") {
      const want = tk.s === ")" ? "(" : "{";
      const top = stack[stack.length - 1];
      if (top && top.s === want) { stack.pop(); openOf[i] = top.i; }
    }
  });
  return openOf;
}

/**
 * @returns {{ line: number, text: string }[]} one entry per statement that is
 *   missing its semicolon, in source order. Empty when nothing is wrong.
 */
export function findMissingSemicolons(source) {
  const { toks } = tokenize(source || "");
  if (toks.length === 0) return [];
  const openOf = matchParens(toks);
  const lines = String(source).split("\n");

  // Line of each token: count the newlines in everything before it.
  const lineOf = new Array(toks.length);
  let line = 1;
  toks.forEach((tk, i) => {
    line += (tk.pre.match(/\n/g) || []).length;
    lineOf[i] = line;
  });

  const problems = [];
  const braces = []; // 'block' | 'init' | 'enum' for each open {
  let parens = 0;

  toks.forEach((t, i) => {
    // ---- keep the bracket context up to date ----
    if (isOp(t, "(")) parens++;
    else if (isOp(t, ")")) parens = Math.max(0, parens - 1);
    else if (isOp(t, "{")) {
      const prev = toks[i - 1];
      const prev2 = toks[i - 2];
      // `{` after = ] , or inside another initializer starts a list of values
      // (int[] a = { 1, 2, 3 }); after `enum Name` a list of constants. Neither
      // ends in a semicolon.
      const isEnum = prev && prev.t === "id" && prev2 && prev2.t === "id" && prev2.s === "enum";
      const isList = isOp(prev, "=") || isOp(prev, "]") || isOp(prev, ",") || braces[braces.length - 1] === "init";
      // An enum's constants are a list too, but unlike `int[] a = { 1, 2 }` its closing
      // brace is the end of the declaration, not of a statement that needs a semicolon.
      braces.push(isEnum ? "enum" : isList ? "init" : "block");
    }

    // A `}` that closes the OUTERMOST value list (`int[] a = { 1, 2, 3 }`) ends a
    // statement just like `3` would, and needs its semicolon. A block's `}` never does.
    let endsList = false;
    if (isOp(t, "}")) {
      const kind = braces.pop();
      endsList = kind === "init" && braces[braces.length - 1] !== "init";
    }

    const next = toks[i + 1];
    const closing = isOp(next, "}") ? braces[braces.length - 1] : null;

    // ---- is this token the last thing on its statement? ----
    const isValue =
      t.t === "num" || t.t === "str" || t.t === "chr" ||
      isOp(t, ")") || isOp(t, "]") || isOp(t, "++") || isOp(t, "--") ||
      (t.t === "id" && !NOT_AN_END.has(t.s) && !isOp(toks[i - 1], "@")) || // @Override is not a statement
      endsList;
    if (!isValue || parens > 0) return;

    // Only a boundary we can be sure about: the next token starts a later line.
    let atBoundary = false;
    if (!next) atBoundary = true;
    else if (/\n/.test(next.pre)) {
      if (next.t === "id" && !CONTINUES.has(next.s)) atBoundary = true; // a new statement begins
      else if (isOp(next, "}") && closing === "block") atBoundary = true; // the block ends
    }
    if (!atBoundary) return;
    if (braces[braces.length - 1] === "init") return; // inside { 1, 2, 3 }

    // `)` closing an if/for/while/switch header is followed by its body, not a semicolon.
    if (isOp(t, ")") && openOf[i] !== undefined) {
      const head = toks[openOf[i] - 1];
      if (head && head.t === "id" && CONTROL.has(head.s)) {
        // ...except the `while (cond)` that ends a do { } while loop, which needs one.
        const before = toks[openOf[i] - 2];
        const closesDo = head.s === "while" && isOp(before, "}") && (() => {
          const open = openOf[openOf[i] - 2];
          return open !== undefined && toks[open - 1] && toks[open - 1].t === "id" && toks[open - 1].s === "do";
        })();
        if (!closesDo) return;
      }
    }

    const at = lineOf[i];
    problems.push({ line: at, text: (lines[at - 1] || "").trim() });
  });

  return problems;
}

const OPENERS = { "(": ")", "[": "]", "{": "}" };
const CLOSERS = { ")": "(", "]": "[", "}": "{" };

/**
 * Brackets that do not pair up: a `{` that is never closed, a `}` with nothing to
 * close, or `(` closed by `}`. Processing.js is happy to run a sketch with a
 * missing brace (it carries on as if the file ended there), where Processing
 * itself stops with "Found one too many { characters without a } to match it".
 *
 * Unlike the semicolon rule this one cannot be wrong about valid code: balanced
 * brackets are a hard requirement of Java, and the tokenizer already skips
 * brackets inside strings, characters and comments.
 *
 * @returns {{ line: number, text: string, message: string }[]}
 */
export function findBracketProblems(source) {
  const { toks } = tokenize(source || "");
  const lines = String(source || "").split("\n");
  const problems = [];
  const stack = [];
  let line = 1;
  const report = (at, message) => problems.push({ line: at, text: (lines[at - 1] || "").trim(), message });

  for (const tk of toks) {
    line += (tk.pre.match(/\n/g) || []).length;
    if (tk.t !== "op") continue;
    if (OPENERS[tk.s]) {
      stack.push({ s: tk.s, line });
    } else if (CLOSERS[tk.s]) {
      const want = CLOSERS[tk.s];
      const top = stack[stack.length - 1];
      if (top && top.s === want) {
        stack.pop();
      } else if (stack.some((o) => o.s === want)) {
        // Something opened since the matching bracket was never closed: report each, then pair up.
        while (stack[stack.length - 1].s !== want) {
          const lost = stack.pop();
          report(lost.line, `this ${lost.s} is never closed - every ${lost.s} needs a matching ${OPENERS[lost.s]}`);
        }
        stack.pop();
      } else {
        report(line, `this ${tk.s} has no matching ${want} before it`);
      }
    }
  }
  for (const lost of stack) report(lost.line, `this ${lost.s} is never closed - every ${lost.s} needs a matching ${OPENERS[lost.s]}`);
  return problems.sort((a, b) => a.line - b.line);
}
