import React from "react";
import { Minus, Plus, Type } from "lucide-react";

// Smaller/bigger buttons for the code editor's font size, sized to sit in the
// dark editor header next to the title and the points badge.
//
// Presentational on purpose - the state and its persistence live in
// useCodeFontSize, because the page also needs the current size to set the CSS
// variable the editor theme reads.
export default function CodeFontSizeControl({
  fontSize,
  onIncrease,
  onDecrease,
  onReset,
  canIncrease = true,
  canDecrease = true,
}) {
  const btn =
    "px-2 h-7 flex items-center text-slate-300 hover:bg-slate-700 hover:text-slate-100 " +
    "disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-300 " +
    "disabled:cursor-not-allowed transition-colors";

  return (
    <div
      className="flex items-center rounded-md border border-slate-600 overflow-hidden"
      role="group"
      aria-label="Code font size"
    >
      <button
        type="button"
        onClick={onDecrease}
        disabled={!canDecrease}
        className={btn}
        title="Smaller code font"
        aria-label="Make the code font smaller"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>

      {/* Doubles as the reset control. Not a separate third button: the header
          is already busy, and "click the number to put it back" is discoverable
          from the tooltip without spending more width on it. */}
      <button
        type="button"
        onClick={onReset}
        className="px-1.5 h-7 flex items-center gap-1 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
        title="Reset code font size"
        aria-label="Reset the code font size to the default"
      >
        <Type className="w-3 h-3" />
        <span className="text-xs tabular-nums w-[1.6rem] text-center" aria-live="polite">
          {fontSize}
        </span>
      </button>

      <button
        type="button"
        onClick={onIncrease}
        disabled={!canIncrease}
        className={btn}
        title="Bigger code font"
        aria-label="Make the code font bigger"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
