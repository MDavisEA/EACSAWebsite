import { useCallback, useEffect, useState } from "react";

// The student's chosen code font size, in px.
//
// Stored globally rather than per problem: this is a readability preference
// about the student's eyes and screen, not about any one assignment, so having
// to re-set it on every problem would make the control useless to the person
// who most needs it.
const STORAGE_KEY = "code_editor_font_size";

// 16 is what the editor has always rendered at - nothing in the theme set a
// font size, so it inherited the page's. Keeping it as the default means a
// student who never touches the control sees no change.
export const DEFAULT_CODE_FONT_SIZE = 16;
export const MIN_CODE_FONT_SIZE = 10;
export const MAX_CODE_FONT_SIZE = 30;
const STEP = 2;

function clamp(size) {
  return Math.min(MAX_CODE_FONT_SIZE, Math.max(MIN_CODE_FONT_SIZE, size));
}

// localStorage throws outright in some privacy modes rather than just coming
// back empty, so every access is guarded - a student in a locked-down browser
// should still get a working editor at the default size.
function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? clamp(parsed) : DEFAULT_CODE_FONT_SIZE;
  } catch {
    return DEFAULT_CODE_FONT_SIZE;
  }
}

export function useCodeFontSize() {
  // Read lazily in an initializer, not at module scope: this runs in the
  // browser either way, but doing it per mount means a size changed in another
  // tab is picked up when the next problem opens.
  const [fontSize, setFontSize] = useState(readStored);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(fontSize));
    } catch {
      // Preference just does not persist. Not worth surfacing to a student.
    }
  }, [fontSize]);

  const increase = useCallback(() => setFontSize((s) => clamp(s + STEP)), []);
  const decrease = useCallback(() => setFontSize((s) => clamp(s - STEP)), []);
  const reset = useCallback(() => setFontSize(DEFAULT_CODE_FONT_SIZE), []);

  return {
    fontSize,
    increase,
    decrease,
    reset,
    canIncrease: fontSize < MAX_CODE_FONT_SIZE,
    canDecrease: fontSize > MIN_CODE_FONT_SIZE,
  };
}
