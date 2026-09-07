import React from "react";
import { Minus, Plus, Type } from "lucide-react";

// Smaller/bigger buttons for the code editor's font size.
//
// Presentational on purpose - the state and its persistence live in
// useCodeFontSize, because the caller also needs the current size to set the
// CSS variable the editor theme reads.
//
// `dark` matches SampleOutputs' prop of the same name: the control sits in
// CodePracticePage's dark editor header, but also next to the light dialog's
// "Starter code" label in StudentPreviewDialog, where slate-on-slate would be
// nearly invisible.
export default function CodeFontSizeControl({
  fontSize,
  onIncrease,
  onDecrease,
  onReset,
  canIncrease = true,
  canDecrease = true,
  dark = false,
}) {
  const btn = dark
    ? "px-2 h-7 flex items-center text-slate-300 hover:bg-slate-700 hover:text-slate-100 " +
      "disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-300 " +
      "disabled:cursor-not-allowed transition-colors"
    : "px-2 h-7 flex items-center text-muted-foreground hover:bg-slate-100 hover:text-foreground " +
      "disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground " +
      "disabled:cursor-not-allowed transition-colors";

  const resetBtn = dark
    ? "px-1.5 h-7 flex items-center gap-1 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
    : "px-1.5 h-7 flex items-center gap-1 text-muted-foreground hover:text-foreground hover:bg-slate-100 transition-colors";

  return (
    <div
      className={`flex items-center rounded-md border overflow-hidden ${
        dark ? "border-slate-600" : "border-border"
      }`}
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
        className={resetBtn}
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
