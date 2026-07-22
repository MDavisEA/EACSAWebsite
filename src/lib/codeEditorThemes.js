import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// Color values come from the a11y-syntax-highlighting project
// (github.com/ericwbailey/a11y-syntax-highlighting), a theme pair built
// specifically to hit WCAG AAA contrast for every token color against its
// background - not just "looks nice," but verified readable, including for
// common color-vision deficiencies. That's the right bar for a classroom
// tool where every student needs to actually be able to read the code.

const darkColors = {
  background: "#2b2b2b",
  foreground: "#f8f8f2",
  gutterBackground: "#232323",
  gutterForeground: "#8a8a8a",
  // A muted low-saturation tone here reads as "basically invisible" once
  // blended with the semi-transparent active-line wash on top of it - a
  // real editor needs the selection itself to carry enough contrast to
  // survive that, hence a proven, more saturated blue (VS Code's default
  // dark-theme selection color) instead of something closer to the base
  // background.
  selection: "#264f78",
  cursor: "#f8f8f2",
  // Semi-transparent, not opaque - CodeMirror renders the selection layer
  // behind line content (z-index: -2), so an opaque active-line color
  // would fully hide the selection highlight whenever they overlap,
  // which is nearly always since the cursor sits on the active line.
  activeLine: "rgba(255, 255, 255, 0.05)",
  comment: "#d4d0ab",
  keyword: "#6bbeff",
  string: "#66ddec",
  function: "#abe338",
  type: "#dcc6e0",
  number: "#f5ab32",
  operator: "#ffa07a",
  constant: "#ffd700",
};

const lightColors = {
  background: "#fefefe",
  foreground: "#545454",
  gutterBackground: "#f5f5f5",
  gutterForeground: "#909090",
  // See the note on darkColors.selection - VS Code's default light-theme
  // selection color, chosen for the same contrast-survives-blending reason.
  selection: "#add6ff",
  cursor: "#545454",
  // See the note on darkColors.activeLine - must stay semi-transparent.
  activeLine: "rgba(0, 0, 0, 0.035)",
  comment: "#802200",
  keyword: "#326bad",
  string: "#1f7c93",
  function: "#008000",
  type: "#9400d3",
  number: "#a85d00",
  operator: "#696969",
  constant: "#856514",
};

function buildTheme(c, dark) {
  return EditorView.theme(
    {
      "&": { backgroundColor: c.background, color: c.foreground, height: "100%" },
      ".cm-content": { caretColor: c.cursor },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: c.cursor },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: c.selection,
      },
      ".cm-activeLine": { backgroundColor: c.activeLine },
      ".cm-activeLineGutter": { backgroundColor: c.activeLine },
      ".cm-gutters": {
        backgroundColor: c.gutterBackground,
        color: c.gutterForeground,
        border: "none",
      },
      ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
    },
    { dark }
  );
}

function buildHighlightStyle(c) {
  return HighlightStyle.define([
    { tag: [t.comment, t.lineComment, t.blockComment], color: c.comment, fontStyle: "italic" },
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword], color: c.keyword, fontWeight: "bold" },
    { tag: [t.string, t.special(t.string)], color: c.string },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.function },
    { tag: [t.typeName, t.className, t.namespace], color: c.type },
    { tag: [t.number, t.integer, t.float], color: c.number },
    { tag: [t.operator, t.punctuation, t.bracket, t.paren], color: c.operator },
    { tag: [t.bool, t.null, t.self, t.atom], color: c.constant, fontWeight: "bold" },
    { tag: t.variableName, color: c.foreground },
    { tag: t.propertyName, color: c.foreground },
  ]);
}

export const a11yDarkEditorTheme = [buildTheme(darkColors, true), syntaxHighlighting(buildHighlightStyle(darkColors))];
export const a11yLightEditorTheme = [buildTheme(lightColors, false), syntaxHighlighting(buildHighlightStyle(lightColors))];
