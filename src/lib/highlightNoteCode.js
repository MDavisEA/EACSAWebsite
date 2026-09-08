import { highlightJava } from "./javaHighlight";

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Quill's own code-block format is just plain, uncolored text in a <pre> -
// next to the real code editor and the Starter Code viewers, both syntax
// highlighted in the same One Dark palette, a note's code block read as
// "just plain light" by comparison. Recolors every <pre> in a note's saved
// HTML with that same highlighter at render time (not save time), so
// existing notes get colored too without a backfill.
export function highlightNoteCode(html) {
  if (!html || !html.includes("<pre")) return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const blocks = doc.querySelectorAll("pre");
  blocks.forEach((block) => {
    const code = block.textContent.replace(/\n$/, "");
    const lines = highlightJava(code);
    // The color lives in a custom property, not a plain `color:` declaration -
    // .quill-dark's blanket "force every descendant to the light body color"
    // rule (needed to beat inline colors a paste from Word/Docs brings in)
    // is a plain color declaration too, and would otherwise win the very
    // next cascade step over this one. The stylesheet rule for `.ql-token`
    // reads the variable back with its own higher-specificity `!important`.
    block.innerHTML = lines
      .map((tokens) =>
        tokens
          .map(
            (t) =>
              `<span class="ql-token" style="--tok-color:${t.color};${t.italic ? "font-style:italic" : ""}">${escapeHtml(t.text)}</span>`
          )
          .join("")
      )
      .join("\n");
  });
  return doc.querySelector("div").innerHTML;
}
