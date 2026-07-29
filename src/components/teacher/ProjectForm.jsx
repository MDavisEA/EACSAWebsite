import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import CodeMirror from "@uiw/react-codemirror";
import { java } from "@codemirror/lang-java";
import { a11yLightEditorTheme } from "@/lib/codeEditorThemes";

// Defined once at module scope, not inline in JSX - a new array reference
// on every render makes @uiw/react-codemirror tear down and rebuild the
// editor's state, which drops the current selection/cursor mid-edit.
const CODE_EXTENSIONS = [java(), ...a11yLightEditorTheme];

const QUILL_MODULES = {
  toolbar: [
    [{ header: [false, 3, 4] }],
    ["bold", "italic", "underline", "code"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["code-block"],
    ["clean"],
  ],
};

const QUILL_FORMATS = ["header", "bold", "italic", "underline", "code", "list", "bullet", "code-block"];

const DEFAULT_REVIEW_PROMPT = `Review each student's submission against the rubric above. Do not assign a grade or numeric score - instead, flag which submissions I should read closely and why, note anything that appears to work by accident or via a shortcut rather than genuine understanding, and call out any misconceptions worth addressing with the whole class.`;

function defaultForm() {
  return {
    title: "",
    description_html: "",
    rubric_md: "",
    starter_code: "",
    review_prompt: DEFAULT_REVIEW_PROMPT,
    is_active: true,
  };
}

export default function ProjectForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial ? { ...defaultForm(), ...initial } : defaultForm());

  const updateField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const isValid = form.title.trim();

  const handleSubmit = () => {
    if (!isValid) return;
    onSave(form);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Project Title *</Label>
        <Input
          value={form.title}
          onChange={(e) => updateField("title", e.target.value)}
          placeholder="e.g. Inventory Management System"
        />
      </div>

      <div className="space-y-2">
        <Label>Assignment Description</Label>
        <div className="min-h-[150px]">
          <ReactQuill
            value={form.description_html || ""}
            onChange={(val) => updateField("description_html", val)}
            modules={QUILL_MODULES}
            formats={QUILL_FORMATS}
            placeholder="Describe the project - requirements, deliverables, deadline..."
            className="bg-white"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Rubric</Label>
        <Textarea
          value={form.rubric_md || ""}
          onChange={(e) => updateField("rubric_md", e.target.value)}
          placeholder={"Plain text or Markdown is fine, e.g.:\n\n- Uses at least one loop instead of repeated code (2 pts)\n- Variable and method names describe what they hold/do (2 pts)\n- No magic numbers - constants are named (1 pt)"}
          className="font-mono text-sm min-h-[180px]"
        />
        <p className="text-xs text-muted-foreground">
          Shown to students on their submission page, and included in the export for your AI review pass.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Starter Code (optional, shown to students)</Label>
        <div className="border rounded-md overflow-hidden">
          <CodeMirror
            value={form.starter_code || ""}
            onChange={(value) => updateField("starter_code", value)}
            placeholder="Paste any starter code you're handing out, if any..."
            extensions={CODE_EXTENSIONS}
            theme="none"
            minHeight="150px"
            basicSetup={{ tabSize: 4 }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Included in the export so your AI review pass knows what was given to students, rather
          than reviewing your own boilerplate as if a student wrote it.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Review Instructions (for Claude/Cowork, not shown to students)</Label>
        <Textarea
          value={form.review_prompt || ""}
          onChange={(e) => updateField("review_prompt", e.target.value)}
          className="text-sm min-h-[120px]"
        />
      </div>

      <div className="flex items-center gap-3 pt-2 border-t pt-4">
        <Switch checked={form.is_active} onCheckedChange={(v) => updateField("is_active", v)} />
        <Label>Active (visible to students)</Label>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!isValid}>
          {initial ? "Save Changes" : "Create Project"}
        </Button>
      </div>
    </div>
  );
}
