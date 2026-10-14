import { tokenize } from "./javaFixes.js";

// When a student's sketch throws, the browser reports a line in the JavaScript
// Processing.js GENERATED from their code - useless to them. This finds the line
// of THEIR code that the error came from, so the console can say "line 12".
//
// How: the stack trace gives the failing line of the generated code and the name
// of the function it was in. The generated code keeps each statement on its own
// line with the same identifiers and numbers (it only adds things like `$p.` and
// `var`), but it moves classes around, drops comments and renumbers lines, so
// lines cannot simply be counted. Instead:
//   1. narrow to the student's function of that name (draw, setup, show, ...);
//   2. if the error names something ("ballX is not defined"), keep only the
//      lines that mention it - a misspelled name is usually on exactly one;
//   3. pick the line whose words best match the failing generated line.
// Anything it is not confident about it declines to answer, because a wrong line
// number is worse than none: a student will go and stare at the wrong line.
//
// This is pure (text in, answer out) so it is unit tested; see errorLocation.test.js.

const WORD = /[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"/g;
// Words that appear on only one side of the translation (types vs `var`, JS glue).
const NOISE = new Set([
  "var", "new", "function", "this", "int", "float", "double", "long", "short", "byte", "char", "boolean",
  "String", "void", "final", "static", "public", "private", "protected", "true", "false", "null", "if", "else",
  "for", "while", "do", "return", "break", "continue", "switch", "case", "default", "PImage", "color",
]);

/** Pulls the failing generated line (1-based, within the sketch's own code) and function name from a stack. */
export function parseStack(stack, generatedLineCount) {
  for (const raw of String(stack || "").split("\n")) {
    // Chrome / Edge:  "    at draw (eval at start (about:srcdoc:1:2), <anonymous>:12:14)"
    let m = raw.match(/^\s*at\s+(?:(.+?)\s+\()?.*<anonymous>:(\d+):(\d+)\)?\s*$/);
    // Firefox:        "draw@about:srcdoc line 1 > Function:12:14"
    if (!m) {
      const f = raw.match(/^(.*?)@.*Function:(\d+):(\d+)\s*$/);
      if (f) m = [raw, f[1], f[2], f[3]];
    }
    if (!m) continue;
    // `new Function` puts two lines of its own before the body, so the body's line N
    // is reported as N + 2; the body's first line IS the generated code's first.
    const line = Number(m[2]) - 2;
    if (line < 1 || line > generatedLineCount) continue; // a frame from Processing.js itself
    return { genLine: line, fn: (m[1] || "").trim() };
  }
  return null;
}

function normalizeFnName(fn) {
  const last = String(fn || "").split(".").pop() || "";
  if (/^\$constr|^\$superCstr/.test(last)) return { constructor: true, name: null };
  return { constructor: false, name: last.replace(/\$\d+$/, "") || null };
}

function stripComments(line) {
  return line.replace(/\/\*.*?\*\//g, " ").replace(/\/\/.*$/, "");
}

function words(line) {
  return (stripComments(line).match(WORD) || []).filter((w) => !NOISE.has(w));
}

function genWords(line) {
  return (
    line
      .replace(/\$p\./g, " ")
      .replace(/\$this_\d+\./g, " ")
      .replace(/\$[A-Za-z0-9_]+/g, " ")
      .match(WORD) || []
  ).filter((w) => !NOISE.has(w));
}

/** The names an error message points at: "ballX is not defined" -> ["ballX"]. */
export function hintsFromMessage(message) {
  const m = String(message || "");
  const out = [];
  let r;
  if ((r = m.match(/^(?:Uncaught )?(?:ReferenceError: )?([A-Za-z_$][\w$]*) is not defined/))) out.push(r[1]);
  else if ((r = m.match(/([A-Za-z_$][\w$]*) is not a function/))) out.push(r[1]);
  else if ((r = m.match(/\(reading '([^']+)'\)|\(setting '([^']+)'\)/))) out.push(r[1] || r[2]);
  else if ((r = m.match(/Cannot (?:read|set) propert(?:y|ies) '?([A-Za-z_$][\w$]*)'? of/))) out.push(r[1]);
  return out.filter((h) => h && !h.startsWith("$"));
}

// Line number (1-based) of every token, counted from the newlines before it.
function tokenLines(toks) {
  let line = 1;
  return toks.map((tk) => {
    line += (tk.pre.match(/\n/g) || []).length;
    return line;
  });
}

/** [firstLine, lastLine] of each method called `name`; constructors are every class body when `ctor`. */
function regionsFor(preprocessed, name, ctor) {
  const { toks } = tokenize(preprocessed);
  const at = tokenLines(toks);
  const open = {};
  const stack = [];
  toks.forEach((tk, i) => {
    if (tk.t !== "op") return;
    if (tk.s === "{" || tk.s === "(") stack.push(i);
    else if (tk.s === "}" || tk.s === ")") {
      const o = stack.pop();
      if (o !== undefined) open[o] = i;
    }
  });
  const regions = [];
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (ctor) {
      // `class Name {` ... `}` - a constructor's body is somewhere inside its class.
      if (tk.t === "id" && tk.s === "class") {
        const brace = toks.findIndex((x, j) => j > i && x.t === "op" && x.s === "{");
        if (brace > 0 && open[brace] !== undefined) regions.push([at[i], at[open[brace]]]);
      }
      continue;
    }
    if (tk.t !== "id" || tk.s !== name || !(toks[i + 1] && toks[i + 1].s === "(")) continue;
    const prev = toks[i - 1];
    if (!prev || prev.s === "." || (prev.t === "id" && prev.s === "new")) continue; // a call, not a declaration
    const close = open[i + 1];
    if (close === undefined) continue;
    let b = close + 1;
    while (toks[b] && toks[b].t === "id" && toks[b].s === "throws") b += 2;
    if (!(toks[b] && toks[b].s === "{") || open[b] === undefined) continue;
    regions.push([at[i], at[open[b]]]);
  }
  return regions;
}

/**
 * @param {object} a
 * @param {string} a.preprocessed  the code actually handed to Processing.js (same line count as the original)
 * @param {string} a.generated     Processing.js's JavaScript for it
 * @param {string} a.stack         the error's stack trace
 * @param {string} a.message       the error's message
 * @returns {{ line: number, others: number[] } | null}  1-based lines of `preprocessed`
 */
export function locateRuntimeError({ preprocessed, generated, stack, message }) {
  const javaLines = String(preprocessed || "").split("\n");
  const genLines = String(generated || "").split("\n");
  const hints = hintsFromMessage(message);
  const where = parseStack(stack, genLines.length);

  // Candidate Java lines: every non-blank, non-comment line...
  let candidates = javaLines
    .map((text, i) => ({ line: i + 1, ws: words(text), text }))
    .filter((c) => c.ws.length > 0);

  // ...narrowed to the function the stack says it was in.
  if (where) {
    const { constructor, name } = normalizeFnName(where.fn);
    if (constructor || name) {
      const regions = regionsFor(preprocessed, name, constructor);
      if (regions.length > 0) {
        const inside = candidates.filter((c) => regions.some(([a, b]) => c.line >= a && c.line <= b));
        if (inside.length > 0) candidates = inside;
      }
    }
  }

  // An error that names something ("scor is not defined") can only be on a line that says it.
  const mentioning = hints.length
    ? candidates.filter((c) => hints.some((h) => new RegExp(`(^|[^A-Za-z0-9_$])${h.replace(/\$/g, "\\$")}($|[^A-Za-z0-9_$])`).test(stripComments(c.text))))
    : [];
  if (mentioning.length > 0) candidates = mentioning;

  // With the generated line in hand, the best word-for-word match wins.
  if (where) {
    const gw = genWords(genLines[where.genLine - 1] || "");
    if (gw.length > 0) {
      const scored = candidates
        .map((c) => {
          const set = new Set(c.ws);
          const hit = gw.filter((w) => set.has(w)).length;
          return { c, precision: hit / gw.length, jaccard: hit / new Set([...gw, ...c.ws]).size };
        })
        .sort((a, b) => b.precision - a.precision || b.jaccard - a.jaccard || a.c.line - b.c.line);
      const best = scored[0];
      if (best && best.precision >= 0.6) {
        const ties = scored.filter((s) => s.precision === best.precision && s.jaccard === best.jaccard);
        // Other lines worth a look: equally good matches (the same statement written twice),
        // and - for a misspelled name - every other line that uses it, since the student
        // will need to fix those too.
        const others = [...ties.slice(1).map((s) => s.c.line), ...mentioning.map((c) => c.line)]
          .filter((l, i, all) => l !== best.c.line && all.indexOf(l) === i)
          .sort((a, b) => a - b)
          .slice(0, 3);
        return { line: best.c.line, others };
      }
    }
  }

  // No usable stack, or no line matched well enough: if the message named a thing and
  // it is on only a few lines, those are the answer; otherwise decline.
  if (mentioning.length > 0 && mentioning.length <= 3) {
    return { line: mentioning[0].line, others: mentioning.slice(1).map((c) => c.line) };
  }
  return null;
}

/** Plain-English version of a JavaScript error, written for a student. */
export function explainError(message, lineText = "") {
  const m = String(message || "").replace(/^Uncaught\s+/, "").replace(/^[A-Za-z]*Error:\s*/, "");
  let r;
  if ((r = m.match(/^([A-Za-z_$][\w$]*) is not defined/))) {
    const name = r[1];
    const isCall = new RegExp(`(^|[^A-Za-z0-9_$.])${name.replace(/\$/g, "\\$")}\\s*\\(`).test(lineText);
    return isCall
      ? `The function ${name}() doesn't exist. Check the spelling (capital letters matter), or make sure you wrote it.`
      : `The variable ${name} doesn't exist. Check the spelling (capital letters matter), or declare it before using it.`;
  }
  if ((r = m.match(/([A-Za-z_$][\w$.]*) is not a function/))) {
    return `${r[1]}() isn't a function. Check the spelling, and that you're calling it on the right thing.`;
  }
  if (/Cannot (read|set) propert(y|ies) of (null|undefined)|(null|undefined) is not an object|of null|of undefined/.test(m)) {
    const prop = (m.match(/\((?:reading|setting) '([^']+)'\)/) || [])[1];
    return `Something on this line is null - it was never given a value${prop ? ` (so it has no .${prop})` : ""}. This often means an image that didn't load, or an object you didn't create with new.`;
  }
  if (/Maximum call stack/.test(m)) return "A function keeps calling itself and never stops.";
  if (/Invalid array length/.test(m)) return "An array was given a size that isn't allowed (is it negative?).";
  return m;
}
