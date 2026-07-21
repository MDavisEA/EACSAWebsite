/**
 * Eclipse-style Java syntax highlighter.
 * Returns an HTML string with <span> tags for coloring.
 */

const KEYWORDS = new Set([
  "abstract","assert","boolean","break","byte","case","catch","char","class",
  "const","continue","default","do","double","else","enum","extends","final",
  "finally","float","for","goto","if","implements","import","instanceof","int",
  "interface","long","native","new","package","private","protected","public",
  "return","short","static","strictfp","super","switch","synchronized","this",
  "throw","throws","transient","try","void","volatile","while","true","false","null"
]);

// Eclipse color scheme (classic dark-on-white)
const COLORS = {
  keyword:    "#7400FF", // purple - Eclipse keyword color
  string:     "#2A00FF", // dark blue - Eclipse string color
  char:       "#2A00FF",
  comment:    "#3F7F5F", // green - Eclipse comment color
  number:     "#000000", // black
  annotation: "#646464", // grey
  type:       "#000000", // black (types handled via keywords mostly)
};

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function highlightJava(code) {
  // We tokenize character by character / regex by regex
  const tokens = [];
  let i = 0;
  const len = code.length;

  while (i < len) {
    // Single-line comment
    if (code[i] === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i);
      const slice = end === -1 ? code.slice(i) : code.slice(i, end);
      tokens.push({ type: "comment", value: slice });
      i += slice.length;
      continue;
    }

    // Multi-line comment
    if (code[i] === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      const slice = end === -1 ? code.slice(i) : code.slice(i, end + 2);
      tokens.push({ type: "comment", value: slice });
      i += slice.length;
      continue;
    }

    // String literal
    if (code[i] === '"') {
      let j = i + 1;
      while (j < len) {
        if (code[j] === "\\" ) { j += 2; continue; }
        if (code[j] === '"') { j++; break; }
        j++;
      }
      tokens.push({ type: "string", value: code.slice(i, j) });
      i = j;
      continue;
    }

    // Char literal
    if (code[i] === "'") {
      let j = i + 1;
      while (j < len) {
        if (code[j] === "\\") { j += 2; continue; }
        if (code[j] === "'") { j++; break; }
        j++;
      }
      tokens.push({ type: "char", value: code.slice(i, j) });
      i = j;
      continue;
    }

    // Annotation
    if (code[i] === "@") {
      let j = i + 1;
      while (j < len && /\w/.test(code[j])) j++;
      tokens.push({ type: "annotation", value: code.slice(i, j) });
      i = j;
      continue;
    }

    // Number
    if (/[0-9]/.test(code[i]) || (code[i] === "." && /[0-9]/.test(code[i + 1] || ""))) {
      let j = i;
      while (j < len && /[0-9a-fA-FxXlLdDfF_.]/.test(code[j])) j++;
      tokens.push({ type: "number", value: code.slice(i, j) });
      i = j;
      continue;
    }

    // Word (keyword or identifier)
    if (/[a-zA-Z_$]/.test(code[i])) {
      let j = i;
      while (j < len && /[\w$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      tokens.push({ type: KEYWORDS.has(word) ? "keyword" : "ident", value: word });
      i = j;
      continue;
    }

    // Plain text (punctuation, whitespace, etc.)
    tokens.push({ type: "plain", value: code[i] });
    i++;
  }

  // Build HTML
  return tokens.map(({ type, value }) => {
    const escaped = escapeHtml(value);
    const color = COLORS[type];
    if (color && type !== "number") {
      const bold = type === "keyword" ? " font-weight:bold;" : "";
      return `<span style="color:${color};${bold}">${escaped}</span>`;
    }
    return escaped;
  }).join("");
}