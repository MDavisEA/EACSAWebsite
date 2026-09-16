import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check } from "lucide-react";

const emptyChoice = () => ({ code: "", correct: false, why_tempting: "" });

// A single bank item, hand-authored or opened for editing after bulk import.
// Mirrors the JSON shape the AI-generated bank uses (see LoopBulkImportDialog)
// so the two paths land on the same fields.
export default function LoopProblemForm({ initial, onSave, onCancel }) {
  const [type, setType] = useState(initial?.type || "trace");
  const [topic, setTopic] = useState(initial?.topic || "");
  const [difficulty, setDifficulty] = useState(initial?.difficulty || "easy");
  const [code, setCode] = useState(initial?.code || "");
  const [expectedOutput, setExpectedOutput] = useState(initial?.expected_output || "");
  const [shownOutput, setShownOutput] = useState(initial?.shown_output || "");
  const [choices, setChoices] = useState(
    initial?.choices?.length ? initial.choices : [emptyChoice(), emptyChoice(), emptyChoice(), emptyChoice()]
  );

  const updateChoice = (i, patch) => {
    setChoices((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };
  const markCorrect = (i) => {
    setChoices((prev) => prev.map((c, idx) => ({ ...c, correct: idx === i })));
  };

  const isValid =
    topic.trim() &&
    (type === "trace"
      ? code.trim() && expectedOutput.trim().length > 0
      : shownOutput.trim() &&
        choices.every((c) => c.code.trim()) &&
        choices.filter((c) => c.correct).length === 1);

  const handleSubmit = () => {
    if (!isValid) return;
    const base = { type, topic: topic.trim(), difficulty };
    if (type === "trace") {
      onSave({ ...base, code, expected_output: expectedOutput });
    } else {
      onSave({
        ...base,
        shown_output: shownOutput,
        choices: choices.map((c) => ({ code: c.code, correct: c.correct, why_tempting: c.why_tempting || "" })),
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="trace">Trace the output</SelectItem>
              <SelectItem value="multiple_choice">Pick the matching loop</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Topic</Label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="basic-for" />
        </div>
        <div className="space-y-2">
          <Label>Difficulty</Label>
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {type === "trace" ? (
        <>
          <div className="space-y-2">
            <Label>Code</Label>
            <Textarea
              className="font-mono text-sm min-h-[100px]"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={"for (int i = 0; i < 5; i++) {\n    System.out.println(i * 2);\n}"}
            />
          </div>
          <div className="space-y-2">
            <Label>Expected output</Label>
            <Textarea
              className="font-mono text-sm min-h-[80px]"
              value={expectedOutput}
              onChange={(e) => setExpectedOutput(e.target.value)}
              placeholder={"0\n2\n4\n6\n8"}
            />
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label>Output shown to the student</Label>
            <Textarea
              className="font-mono text-sm min-h-[80px]"
              value={shownOutput}
              onChange={(e) => setShownOutput(e.target.value)}
              placeholder={"0\n2\n4\n6\n8"}
            />
          </div>

          <div className="space-y-3">
            <Label>4 choices — mark the correct one</Label>
            {choices.map((c, i) => (
              <div key={i} className={`border rounded-lg p-3 space-y-2 ${c.correct ? "border-emerald-400 bg-emerald-50/40" : ""}`}>
                <div className="flex items-start gap-2">
                  <Button
                    type="button"
                    variant={c.correct ? "default" : "outline"}
                    size="sm"
                    className="flex-shrink-0 mt-0.5"
                    onClick={() => markCorrect(i)}
                  >
                    {c.correct ? <Check className="w-3.5 h-3.5" /> : `#${i + 1}`}
                  </Button>
                  <Textarea
                    className="font-mono text-xs min-h-[60px] flex-1"
                    value={c.code}
                    onChange={(e) => updateChoice(i, { code: e.target.value })}
                    placeholder="for (...) { ... }"
                  />
                </div>
                {!c.correct && (
                  <Input
                    value={c.why_tempting}
                    onChange={(e) => updateChoice(i, { why_tempting: e.target.value })}
                    placeholder="Why a student might pick this one (e.g. off-by-one)"
                    className="text-xs"
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!isValid}>
          {initial?.id ? "Save Changes" : "Create Problem"}
        </Button>
      </div>
    </div>
  );
}
