import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import BriefEditor from "./BriefEditor";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [starterOpen, setStarterOpen] = useState({}); // programId -> box shown
  const update = (i, patch) => onChange(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= parts.length) return;
    const next = [...parts];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  // A bonus program is extra credit, so it is not part of what the assignment is worth.
  const required = parts.filter((p) => !p.optional);
  const total = required.length > 0 && required.every((p) => p.points !== "" && p.points != null && !Number.isNaN(Number(p.points)))
    ? required.reduce((sum, p) => sum + Number(p.points), 0)
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
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pl-7">
                <Checkbox checked={!!p.optional} onCheckedChange={(v) => update(i, { optional: !!v })} />
                Optional bonus &mdash; students don&rsquo;t have to do it, and its points are extra credit on top of the total
              </label>
              <BriefEditor
                value={{ description: p.description, images: p.images }}
                // The editor hands back an updater so a late-finishing upload applies to the latest text.
                onChange={(fn) =>
                  onChange((prev) =>
                    (prev || []).map((q) => (q.id === p.id ? { ...q, ...fn({ description: q.description || "", images: q.images || [] }) } : q))
                  )
                }
                placeholder={"Instructions for this program - steps, requirements, tips. Shown to students right beside the sample output, above their code.\n\nMarkdown works (- bullets, **bold**). Paste a screenshot here to add the sample output."}
              />
              {/* Starter code is per program: give one problem a skeleton and leave
                  the next one blank. Empty means a blank editor. */}
              <div>
                <button
                  type="button"
                  onClick={() => setStarterOpen((o) => ({ ...o, [p.id]: !(o[p.id] ?? !!p.starter) }))}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {(starterOpen[p.id] ?? !!p.starter) ? "▾" : "▸"} Starter code{" "}
                  {p.starter ? (
                    <span className="text-emerald-700">&middot; added</span>
                  ) : (
                    <span>(optional &mdash; leave empty and this program starts blank)</span>
                  )}
                </button>
                {(starterOpen[p.id] ?? !!p.starter) && (
                  <Textarea
                    value={p.starter || ""}
                    onChange={(e) => update(i, { starter: e.target.value })}
                    spellCheck={false}
                    placeholder="Paste the code students should start this program with"
                    className="mt-1.5 font-mono text-xs min-h-[130px] whitespace-pre"
                  />
                )}
              </div>
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
