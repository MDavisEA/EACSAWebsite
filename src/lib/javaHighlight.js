// Syntax colours for the read-only code views (grading, and a student looking
// back at what they turned in).
//
// Why a hand-rolled tokenizer instead of CodeMirror, which this project already
// uses in the editors: those views are not an editor. They are a list of lines
// with a clickable gutter and comment rows spliced in between, which is exactly
// the structure CodeMirror owns and will not share. Highlighting the text
// ourselves keeps that structure and costs one regex pass per line.
//
// One Dark, because it is the scheme most people have already been staring at -
// Atom's default, and the basis of VS Code's most-installed theme - so it reads
// as "code" immediately, and its contrast holds up over a stack of submissions.
export const ONE_DARK = {
  bg: "#282c34",
  plain: "#abb2bf",
  keyword: "#c678dd",
  string: "#98c379",
  number: "#d19a66",
  comment: "#7f848e",
  type: "#e5c07b",
  method: "#61afef",
  annotation: "#e5c07b",
  punctuation: "#828997",
};

const KEYWORDS = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
  "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float",
  "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native",
  "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
  "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
  "volatile", "while", "var", "record", "sealed", "permits", "yield", "true", "false", "null",
]);

// One pass, longest-match-first: strings and comments have to win over
// everything inside them, or a // inside a string would blank the rest of the
// line and a keyword inside a comment would light up.
const TOKEN = new RegExp(
  [
    /(?<comment>\/\/[^\n]*)/.source,
    /(?<blockOpen>\/\*)/.source,
    /(?<str>"(?:\\.|[^"\\])*")/.source,
    /(?<chr>'(?:\\.|[^'\\])*')/.source,
    /(?<annotation>@[A-Za-z_]\w*)/.source,
    /(?<number>\b\d[\d_]*(?:\.\d[\d_]*)?[fFdDlL]?\b)/.source,
    /(?<word>[A-Za-z_$][\w$]*)/.source,
    /(?<space>\s+)/.source,
    /(?<punct>[{}()[\];,.<>=+\-*/%!&|^~?:@])/.source,
  ].join("|"),
  "g"
);

// Splits one line into {text, color} runs. `inBlock` carries /* */ state across
// lines - without it, the body of a multi-line comment would be highlighted as
// if it were code.
function tokenizeLine(line, inBlock) {
  const out = [];
  let block = inBlock;
  let i = 0;

  while (i < line.length) {
    if (block) {
      const end = line.indexOf("*/", i);
      if (end === -1) {
        out.push({ text: line.slice(i), color: ONE_DARK.comment, italic: true });
        return { tokens: out, inBlock: true };
      }
      out.push({ text: line.slice(i, end + 2), color: ONE_DARK.comment, italic: true });
      i = end + 2;
      block = false;
      continue;
    }

    TOKEN.lastIndex = i;
    const m = TOKEN.exec(line);
    if (!m || m.index !== i) {
      // Anything the tokenizer does not recognise is still shown, just plain -
      // dropping it would silently alter a student's code on screen.
      out.push({ text: line[i], color: ONE_DARK.plain });
      i += 1;
      continue;
    }

    const g = m.groups;
    const text = m[0];
    if (g.blockOpen) {
      block = true;
      out.push({ text, color: ONE_DARK.comment, italic: true });
    } else if (g.comment) {
      out.push({ text, color: ONE_DARK.comment, italic: true });
    } else if (g.str || g.chr) {
      out.push({ text, color: ONE_DARK.string });
    } else if (g.annotation) {
      out.push({ text, color: ONE_DARK.annotation });
    } else if (g.number) {
      out.push({ text, color: ONE_DARK.number });
    } else if (g.word) {
      let color = ONE_DARK.plain;
      if (KEYWORDS.has(text)) color = ONE_DARK.keyword;
      else if (line[m.index + text.length] === "(") color = ONE_DARK.method;
      else if (/^[A-Z]/.test(text)) color = ONE_DARK.type;
      out.push({ text, color });
    } else if (g.punct) {
      out.push({ text, color: ONE_DARK.punctuation });
    } else {
      out.push({ text, color: ONE_DARK.plain });
    }
    i += text.length;
  }

  return { tokens: out, inBlock: block };
}

/** Whole file -> one array of {text, color, italic} runs per line. */
export function highlightJava(code) {
  let inBlock = false;
  return String(code ?? "").split("\n").map((line) => {
    const { tokens, inBlock: next } = tokenizeLine(line, inBlock);
    inBlock = next;
    return tokens;
  });
}
