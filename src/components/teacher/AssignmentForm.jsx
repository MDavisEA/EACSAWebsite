import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Upload, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import QuestionEditor from "./QuestionEditor";

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function newQuestion(num) {
  return {
    id: generateId(),
    title: `Question ${num}`,
    prompt: "",
    prompt_html: "",
    prompt_images: [],
    content_type: "rich_text",
    max_score: 9,
    parts: [],
  };
}

export default function AssignmentForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(
    initial
      ? {
          ...initial,
          questions: initial.questions.map((q) => ({
            ...q,
            prompt_images: q.prompt_images || [],
            content_type: q.content_type || "rich_text",
            max_score: q.max_score ?? 9,
          })),
        }
      : {
          title: "",
          directions: "",
          questions: [newQuestion(1)],
          time_limit_minutes: null,
          due_date: "",
          is_active: true,
          reference_sheet_url: "",
        }
  );
  const [refUploading, setRefUploading] = useState(false);
  const refInputRef = useRef();

  const updateField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const addQuestion = () => {
    setForm((f) => ({
      ...f,
      questions: [...f.questions, newQuestion(f.questions.length + 1)],
    }));
  };

  const removeQuestion = (idx) => {
    if (form.questions.length <= 1) return;
    setForm((f) => ({ ...f, questions: f.questions.filter((_, i) => i !== idx) }));
  };

  const updateQuestion = (idx, field, value) => {
    const qs = [...form.questions];
    qs[idx] = { ...qs[idx], [field]: value };
    setForm((f) => ({ ...f, questions: qs }));
  };

  const handleRefUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setRefUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    updateField("reference_sheet_url", file_url);
    setRefUploading(false);
    e.target.value = "";
  };

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    const normalized = {
      ...form,
      questions: form.questions.map((q) => ({
        ...q,
        max_score: q.max_score ?? 9,
      })),
    };
    onSave(normalized);
  };

  return (
    <div className="space-y-6">
      {/* Basic info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Assignment Title *</Label>
          <Input
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="e.g. FRQ Practice #3"
          />
        </div>
        <div className="space-y-2">
          <Label>Time Limit (minutes)</Label>
          <Input
            type="number"
            value={form.time_limit_minutes || ""}
            onChange={(e) =>
              updateField("time_limit_minutes", e.target.value ? parseInt(e.target.value) : null)
            }
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Directions (optional)</Label>
        <Textarea
          value={form.directions || ""}
          onChange={(e) => updateField("directions", e.target.value)}
          placeholder="Instructions shown to students before they begin..."
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>Answer Key URL (optional — shown to you in Grade view)</Label>
        <Input
          value={form.answer_key_url || ""}
          onChange={(e) => updateField("answer_key_url", e.target.value)}
          placeholder="https://... (link to the full answer key PDF or page)"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Due Date (optional)</Label>
          <Input
            type="datetime-local"
            value={form.due_date || ""}
            onChange={(e) => updateField("due_date", e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch
            checked={form.is_active}
            onCheckedChange={(v) => updateField("is_active", v)}
          />
          <Label>Active (visible to students)</Label>
        </div>
      </div>

      {/* Questions */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Questions</h3>
          <Button variant="outline" size="sm" onClick={addQuestion}>
            <Plus className="w-4 h-4 mr-1" /> Add Question
          </Button>
        </div>

        <div className="space-y-6">
          {form.questions.map((q, qi) => (
            <QuestionEditor
              key={q.id}
              question={q}
              questionIndex={qi}
              onUpdate={(field, value) => updateQuestion(qi, field, value)}
              onRemove={() => removeQuestion(qi)}
              canRemove={form.questions.length > 1}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!form.title.trim()}>
          {initial ? "Save Changes" : "Create Assignment"}
        </Button>
      </div>
    </div>
  );
}