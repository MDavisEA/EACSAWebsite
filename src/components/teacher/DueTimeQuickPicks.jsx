import React from "react";

// A due time is almost never typed by hand - it's "right before First
// Block", "by Domino", or "by tonight." These match the school's real bell
// schedule (confirmed against the actual times, not guessed from the block
// names) so setting one is a click instead of a trip to a phone to check
// what time Fourth Block starts.
//
// Only the TIME is set here - whatever date is already in the field (or
// today's, if it's empty) is kept, since <input type="datetime-local"> has
// no way to change just the time half on its own.
const PRESETS = [
  { label: "First Block", hh: 8, mm: 19 },
  { label: "Second Block", hh: 9, mm: 52 },
  { label: "Flex Block", hh: 11, mm: 31 },
  { label: "Fourth Block", hh: 13, mm: 2 },
  { label: "Last Block", hh: 13, mm: 51 },
  { label: "Domino", hh: 15, mm: 40 },
  { label: "10:59pm", hh: 22, mm: 59 },
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function todayLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function DueTimeQuickPicks({ value, onPick }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESETS.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => {
            const datePart = value ? value.slice(0, 10) : todayLocalDate();
            onPick(`${datePart}T${pad(p.hh)}:${pad(p.mm)}`);
          }}
          className="text-xs font-medium text-slate-600 border rounded-full px-2.5 py-1 hover:border-primary hover:text-primary transition-colors"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
