// One Quill setup for every rich text box in the teacher UI - problem
// descriptions, project descriptions, FRQ prompts, answer keys and notes.
//
// This used to be five identical copies of the same two constants sitting at
// the top of five different form files, which is exactly how the link button
// came to be missing from all of them at once.
//
// `formats` is a whitelist, not a hint: Quill strips anything not listed, so a
// format missing from it cannot be pasted in either, only typed and lost. Both
// lists have to stay in step.
export const QUILL_MODULES = {
  toolbar: [
    [{ header: [false, 3, 4] }],
    ["bold", "italic", "underline", "code"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["link"],
    ["code-block"],
    ["clean"],
  ],
};

export const QUILL_FORMATS = [
  "header",
  "bold",
  "italic",
  "underline",
  "code",
  "list",
  "bullet",
  "link",
  "code-block",
];

// Quill writes a bare <a href="...">. It has no concept of a link target, and
// `target` is not a format it will keep, so opening in a new tab has to be
// arranged at render time instead.
//
// Worth doing rather than letting links navigate in place: a student clicking
// a Google Doc in the directions on the coding page would otherwise leave the
// editor with half-written code behind them.
//
// Left alone if the anchor already carries a target - directions imported from
// Canvas arrive with one - so this is safe to apply twice.
export function openLinksInNewTab(html) {
  if (!html) return html;

  return html.replace(/<a\b([^>]*)>/gi, (whole, attrs) => {
    if (/\btarget\s*=/i.test(attrs)) return whole;
    return `<a${attrs} target="_blank" rel="noopener noreferrer">`;
  });
}
