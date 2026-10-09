import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

// The list of programs a sketch assignment asks for - a problem set of mini
// programs instead of one big one. Left empty it is a single-program assignment,
// exactly as sketches have always been.
//
// Each program keeps the same id for life (it is what a student's code and your
// per-program scores are filed under), so renaming or reordering is always safe;
// only deleting one orphans work already turned in against it.

const newId = () => `p_${Math.random().toString(36).slice(2, 8)}`;

export default function ProgramsEditor({ value, onChange }) {
  const parts = value || [];

  const update = (i, patch) => onChange(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= parts.length) return;
    const next = [...parts];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const total = parts.length > 0 && parts.every((p) => p.points !== "" && p.points != null && !Number.isNaN(Number(p.points)))
    ? parts.reduce((sum, p) => sum + Number(p.points), 0)
    : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Programs {parts.length > 0 && <span className="text-muted-foreground font-normal">({parts.length})</span>}</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...parts, { id: newId(), title: "", description: "", points: "" }])}>
          <Plus className="w-4 h-4 mr-1.5" /> Add program
        </Button>
      </div>

      {parts.length === 0 ? (
        <p className="text-xs text-muted-foreground border rounded-lg p-3 bg-slate-50/50">
          One program per student - the usual case. Add programs here when this is a <strong>problem set</strong>:
          students get a tab for each, you score and comment on each separately, and the total is added up for you.
        </p>
      ) : (
        <div className="space-y-2">
          {parts.map((p, i) => (
            <div key={p.id} className="border rounded-lg p-3 space-y-2 bg-slate-50/40">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground w-5 text-right">{i + 1}.</span>
                <Input
                  value={p.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  placeholder={`Program ${i + 1} title, e.g. Bouncing ball`}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min="0"
                  value={p.points ?? ""}
                  onChange={(e) => update(i, { points: e.target.value })}
                  placeholder="pts"
                  className="w-20"
                  title="Points this program is worth (optional)"
                />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, 1)} disabled={i === parts.length - 1} title="Move down">
                  <ArrowDown className="w-4 h-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onChange(parts.filter((_, j) => j !== i))} title="Remove">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <Textarea
                value={p.description || ""}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="What this program should do (optional, shown to students above their code)"
                className="text-sm min-h-[56px]"
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            {total != null ? `Worth ${total} points in total. ` : "Give every program points to get a total out of. "}
            Removing a program hides any code students already wrote for it.
          </p>
        </div>
      )}
    </div>
  );
}
