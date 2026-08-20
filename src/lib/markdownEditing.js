// Pure text-manipulation helpers behind both the rubric's toolbar buttons and
// its keyboard shortcuts, so "click Bold" and "press Cmd/Ctrl+B" produce
// identical results instead of two hand-maintained copies of the same
// wrap-the-selection logic.

// Wraps the current selection in `prefix`/`suffix` (markdown for bold/italic/
// etc.). With nothing selected, wraps `placeholder` instead and selects it,
// so the next keystroke overwrites it - typing **bold** by pressing Cmd+B
// first should still work, not require selecting text before it exists.
export function wrapSelection(value, start, end, prefix, suffix = prefix, placeholder = "text") {
  const selected = value.slice(start, end) || placeholder;
  const text = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
  const selStart = start + prefix.length;
  return { text, selStart, selEnd: selStart + selected.length };
}

// Applies a line prefix ("- " or "1. ") to every non-blank line the current
// selection touches. Toggles off if every touched line already has it, so
// hitting the same button twice undoes it instead of double-prefixing.
export function applyLinePrefix(value, start, end, prefix) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = value.indexOf("\n", end > start ? end - 1 : end);
  if (lineEnd === -1) lineEnd = value.length;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const nonBlank = lines.filter((l) => l.trim() !== "");
  const alreadyPrefixed = nonBlank.length > 0 && nonBlank.every((l) => l.startsWith(prefix));
  const newLines = lines.map((l) => (l.trim() === "" ? l : alreadyPrefixed ? l.slice(prefix.length) : prefix + l));
  const newBlock = newLines.join("\n");
  const text = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
  return { text, selStart: lineStart, selEnd: lineStart + newBlock.length };
}
