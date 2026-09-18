import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const STANDALONE = "__standalone__";
const DIFFICULTIES = ["easy", "medium", "hard"];

// A practice set a student can start: how many correct answers it takes to
// finish, what a wrong one costs, and (optionally) which class it's filed
// under - course_id/unit_id are both nullable, so this can be assigned
// outside of any class as well as inside one.
export default function LoopAssignmentForm({ initial, courses, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [courseId, setCourseId] = useState(initial?.course_id || "");
  const [unitId, setUnitId] = useState(initial?.unit_id || "");
  const [targetScore, setTargetScore] = useState(initial?.target_score ?? 10);
  const [wrongPenalty, setWrongPenalty] = useState(initial?.wrong_penalty ?? 0.5);
  const [partialCredit, setPartialCredit] = useState(initial?.partial_credit ?? 0.5);
  const [typeFilter, setTypeFilter] = useState(initial?.type_filter || "both");
  const [topicFilter, setTopicFilter] = useState((initial?.topic_filter || []).join(", "));
  const [difficultyFilter, setDifficultyFilter] = useState(initial?.difficulty_filter || []);

  const toggleDifficulty = (d) => {
    setDifficultyFilter((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const isValid =
    title.trim() && Number(targetScore) > 0 && Number(wrongPenalty) >= 0 && Number(partialCredit) >= 0;

  const handleSubmit = () => {
    if (!isValid) return;
    onSave({
      title: title.trim(),
      course_id: courseId || null,
      unit_id: courseId ? unitId || null : null,
      target_score: Number(targetScore),
      wrong_penalty: Number(wrongPenalty),
      partial_credit: Number(partialCredit),
      type_filter: typeFilter,
      topic_filter: topicFilter.trim()
        ? topicFilter.split(",").map((t) => t.trim()).filter(Boolean)
        : null,
      difficulty_filter: difficultyFilter.length > 0 ? difficultyFilter : null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For Loops: Level 1" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Class (optional)</Label>
          <Select
            value={courseId || STANDALONE}
            onValueChange={(v) => { setCourseId(v === STANDALONE ? "" : v); setUnitId(""); }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={STANDALONE}>Standalone (not tied to a class)</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Unit</Label>
          <Select value={unitId || ""} onValueChange={setUnitId} disabled={!courseId}>
            <SelectTrigger>
              <SelectValue placeholder={courseId ? "Unfiled" : "Pick a class first"} />
            </SelectTrigger>
            <SelectContent>
              {(courses.find((c) => c.id === courseId)?.units || []).map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>Target score</Label>
          <Input
            type="number"
            min="1"
            step="1"
            value={targetScore}
            onChange={(e) => setTargetScore(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Correct answers needed to finish (+1 each).</p>
        </div>
        <div className="space-y-2">
          <Label>Penalty per wrong answer</Label>
          <Input
            type="number"
            min="0"
            step="0.25"
            value={wrongPenalty}
            onChange={(e) => setWrongPenalty(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Subtracted from the score (never below 0).</p>
        </div>
        <div className="space-y-2">
          <Label>Partial credit (2nd try)</Label>
          <Input
            type="number"
            min="0"
            step="0.25"
            value={partialCredit}
            onChange={(e) => setPartialCredit(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Multiple choice only: awarded instead of full credit if they get it right on a second guess.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Question type</Label>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="both">Both trace and multiple choice</SelectItem>
            <SelectItem value="trace">Trace the output only</SelectItem>
            <SelectItem value="multiple_choice">Pick the matching loop only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Topics (optional, comma-separated)</Label>
        <Input
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          placeholder="basic-for, nested-for (leave blank for all topics)"
        />
      </div>

      <div className="space-y-2">
        <Label>Difficulty (optional)</Label>
        <div className="flex gap-4">
          {DIFFICULTIES.map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm capitalize">
              <Checkbox checked={difficultyFilter.includes(d)} onCheckedChange={() => toggleDifficulty(d)} />
              {d}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Leave all unchecked to include every difficulty.</p>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!isValid}>
          {initial?.id ? "Save Changes" : "Create Practice Set"}
        </Button>
      </div>
    </div>
  );
}
