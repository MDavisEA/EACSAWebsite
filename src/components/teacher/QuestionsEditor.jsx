import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

// The written questions on a sketch assignment - text answers the student types
// beside their programs ("explain what draw does"). They come BEFORE the programs
// on the student's page. Left empty there is no written part at all.
//
// Like programs, each question keeps its id for life (the student's answer and your
// score are filed under it), so rewording or reordering is always safe.

const newId = () => `q_${Math.random().toString(36).slice(2, 8)}`;

export default function QuestionsEditor({ value, onChange }) {
  const questions = value || [];
  const update = (i, patch) => onChange(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const total =
    questions.length > 0 && questions.every((q) => q.points !== "" && q.points != null && !Number.isNaN(Number(q.points)))
      ? questions.reduce((sum, q) => sum + Number(q.points), 0)
      : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>
          Written questions {questions.length > 0 && <span className="text-muted-foreground font-normal">({questions.length})</span>}
        </Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...questions, { id: newId(), prompt: "", points: "", code: false }])}>
          <Plus className="w-4 h-4 mr-1.5" /> Add question
        </Button>
      </div>

      {questions.length === 0 ? (
        <p className="text-xs text-muted-foreground border rounded-lg p-3 bg-slate-50/50">
          Optional. Add questions here when students should also <strong>write answers</strong> &mdash; vocabulary,
          &ldquo;what does this code do?&rdquo;, reflections. They answer in a text box <em>before</em> the programs, you see
          the answers next to their code, and each question is scored separately.
        </p>
      ) : (
        <div className="space-y-2">
          {questions.map((q, i) => (
            <div key={q.id} className="border rounded-lg p-3 space-y-2 bg-slate-50/40">
              <div className="flex items-start gap-2">
                <span className="text-sm font-medium text-muted-foreground w-5 text-right pt-2">{i + 1}.</span>
                <Textarea
                  value={q.prompt}
                  onChange={(e) => update(i, { prompt: e.target.value })}
                  placeholder="The question, e.g. What is the difference between draw and setup?"
                  className="flex-1 min-h-[60px] text-sm"
                />
                <Input
                  type="number"
                  min="0"
                  value={q.points ?? ""}
                  onChange={(e) => update(i, { points: e.target.value })}
                  placeholder="pts"
                  className="w-20"
                  title="Points this question is worth (optional)"
                />
                <div className="flex flex-col">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-8" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-8" onClick={() => move(i, 1)} disabled={i === questions.length - 1} title="Move down">
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onChange(questions.filter((_, j) => j !== i))} title="Remove">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pl-7">
                <Checkbox checked={!!q.code} onCheckedChange={(v) => update(i, { code: !!v })} />
                They answer with code (a box that keeps spacing and uses a code font &mdash; for &ldquo;write the modification&rdquo;)
              </label>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            {total != null ? `Worth ${total} points in total. ` : "Give every question points to get a total out of. "}
            Questions with no wording are dropped when you save. Removing a question hides answers students already wrote.
          </p>
        </div>
      )}
    </div>
  );
}
