import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DueTimeQuickPicks from "./DueTimeQuickPicks";

// Optional per-section override of the due date above - a teacher with more
// than one block on this course's roster can give one block a different
// deadline (a section that meets earlier in the day, a make-up section)
// without turning it into a second, separate assignment. Leaving a section
// blank here just means it uses the due date above, same as before this
// existed.
//
// `value` is the same local "YYYY-MM-DDTHH:mm" shape the main due-date field
// uses (not ISO) - the form converts both to ISO together at submit time, so
// this never needs to know the difference.
export default function SectionDueDatesEditor({ sections, value, onChange }) {
  if (!sections || sections.length === 0) return null;

  const byId = new Map((value || []).map((v) => [v.section_id, v.due_date]));

  const setFor = (sectionId, dueDate) => {
    const next = (value || []).filter((v) => v.section_id !== sectionId);
    if (dueDate) next.push({ section_id: sectionId, due_date: dueDate });
    onChange(next);
  };

  return (
    <div className="space-y-3 border rounded-lg p-3 bg-slate-50/50">
      <p className="text-xs font-medium text-slate-600">Different due date per section (optional)</p>
      {sections.map((sec) => {
        const current = byId.get(sec.id) || "";
        return (
          <div key={sec.id} className="space-y-1.5 pb-3 border-b last:border-b-0 last:pb-0">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-slate-500">{sec.name}</Label>
              {current && (
                <button
                  type="button"
                  onClick={() => setFor(sec.id, "")}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Use the due date above
                </button>
              )}
            </div>
            <Input
              type="datetime-local"
              value={current}
              onChange={(e) => setFor(sec.id, e.target.value)}
              className="h-8 text-sm"
            />
            {/* Not gated on `current` - the whole point of a quick pick is
                setting this WITHOUT hand-typing a date first. */}
            <DueTimeQuickPicks value={current} onPick={(v) => setFor(sec.id, v)} />
          </div>
        );
      })}
    </div>
  );
}
