import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { Upload, FileCode2, X, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import SampleOutputsEditor from "./SampleOutputsEditor";

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

const DEFAULT_REVIEW_PROMPT = `Review each submission against the rubric above. Do not assign grades or numeric scores.

Keep every entry short and scannable - I am reading a lot of these in one sitting. No preamble, no restating the assignment back to me.

For each student, use this shape:

### Student Name
- BROKEN - file:line - what the logic error actually is, in one sentence
- BETTER - what they could have done more simply or efficiently, in one sentence
- SUSPECT - anything that only appears to work, or works by accident or via a shortcut rather than real understanding

Rules:
- Always include the file name and line number on anything BROKEN. Being able to jump straight to it matters more to me than explaining it thoroughly.
- Skip any line that does not apply. If a submission is correct and well written, just write "clean" and move on.
- One sentence per line. If something genuinely needs more explanation, put it underneath that student rather than making the line longer.

At the end, add a "Class-wide" section listing any misconception common enough to be worth addressing with the whole class, most common first.`;

function defaultForm() {
  return {
    title: "",
    description_html: "",
    rubric_md: "",
    starter_files: [],
    google_doc_url: "",
    sample_outputs: [],
    course_id: null,
    unit_id: null,
    due_date: "",
    review_prompt: DEFAULT_REVIEW_PROMPT,
    is_active: true,
  };
}

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time, but
// due_date round-trips through Postgres as a UTC ISO string.
function toLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Adds/replaces files by filename (dropping the same file twice, or a gist
// re-fetch that overlaps with files already added by hand, overwrites
// rather than duplicating).
function mergeFiles(existing, incoming) {
  const merged = [...existing];
  incoming.forEach((file) => {
    const idx = merged.findIndex((f) => f.filename === file.filename);
    if (idx >= 0) merged[idx] = file;
    else merged.push(file);
  });
  return merged;
}

export default function ProjectForm({ initial, courses = [], onSave, onCancel }) {
  const [form, setForm] = useState(
    initial
      ? { ...defaultForm(), ...initial, due_date: toLocalInputValue(initial.due_date) }
      : { ...defaultForm(), course_id: initial?.course_id ?? null, unit_id: initial?.unit_id ?? null }
  );
  const [dragActive, setDragActive] = useState(false);
  const [gistUrl, setGistUrl] = useState("");
  const [fetchingGist, setFetchingGist] = useState(false);
  const [gistError, setGistError] = useState("");
  const [previewing, setPreviewing] = useState(null);
  const fileInputRef = useRef(null);

  const updateField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const isValid = form.title.trim() && form.course_id;

  const handleSubmit = () => {
    if (!isValid) return;
    // Empty strings would fail Postgres timestamp/uuid parsing - send null.
    onSave({
      ...form,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      course_id: form.course_id || null,
      unit_id: form.unit_id || null,
    });
  };

  const addFiles = async (fileList) => {
    const javaFiles = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith(".java"));
    const read = await Promise.all(javaFiles.map(async (f) => ({ filename: f.name, content: await f.text() })));
    if (read.length > 0) {
      setForm((f) => ({ ...f, starter_files: mergeFiles(f.starter_files, read) }));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  };

  const handleFileInput = (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  };

  const handleFetchGist = async () => {
    if (!gistUrl.trim()) return;
    setFetchingGist(true);
    setGistError("");
    try {
      const result = await base44.entities.Project.fetchStarterGist(gistUrl.trim());
      setForm((f) => ({ ...f, starter_files: mergeFiles(f.starter_files, result.files) }));
      setGistUrl("");
    } catch (e) {
      setGistError(e.message || "Couldn't fetch that gist.");
    } finally {
      setFetchingGist(false);
    }
  };

  const removeFile = (filename) => {
    setForm((f) => ({ ...f, starter_files: f.starter_files.filter((sf) => sf.filename !== filename) }));
    setPreviewing((p) => (p === filename ? null : p));
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Course *</Label>
          <Select
            value={form.course_id || ""}
            onValueChange={(v) => updateField("course_id", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a course" />
            </SelectTrigger>
            <SelectContent>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Which class this belongs to. Only students on that roster will see it.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Unit *</Label>
          <Select
            value={form.unit_id || ""}
            onValueChange={(v) => updateField("unit_id", v)}
            disabled={!form.course_id}
          >
            <SelectTrigger>
              <SelectValue placeholder={form.course_id ? "Choose a unit" : "Pick a course first"} />
            </SelectTrigger>
            <SelectContent>
              {(courses.find((c) => c.id === form.course_id)?.units || []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Change this later to move it to another unit.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Due Date</Label>
          <Input
            type="datetime-local"
            value={form.due_date || ""}
            onChange={(e) => updateField("due_date", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Optional. Submissions after this are flagged late - it does not block them.
          </p>
        </div>
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
        <Label>Google Doc (optional)</Label>
        <Input
          value={form.google_doc_url || ""}
          onChange={(e) => updateField("google_doc_url", e.target.value)}
          placeholder="https://docs.google.com/document/d/..."
        />
        <p className="text-xs text-muted-foreground">
          For directions easier to write in Docs than the box above. Embedded on the student page and
          pulled into the review export - share it as "Anyone with the link - Viewer" first.
        </p>
      </div>

      {/* What the finished program should look like when it runs. Sits next to
          the directions on the student page, which is where "what is this
          supposed to do?" actually comes up. */}
      <SampleOutputsEditor value={form.sample_outputs} onChange={(v) => updateField("sample_outputs", v)} />

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

        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
          }`}
        >
          <Upload className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag .java files here, or click to browse (folders aren't read - select the files inside)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".java"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Paste a gist URL to pull starter files from"
            value={gistUrl}
            onChange={(e) => setGistUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFetchGist()}
          />
          <Button variant="outline" onClick={handleFetchGist} disabled={fetchingGist || !gistUrl.trim()}>
            {fetchingGist ? <Loader2 className="w-4 h-4 animate-spin" /> : "Fetch"}
          </Button>
        </div>
        {gistError && <p className="text-sm text-destructive">{gistError}</p>}

        {form.starter_files.length > 0 && (
          <div className="space-y-2 pt-1">
            {form.starter_files.map((f) => (
              <div key={f.filename} className="border rounded-lg bg-slate-50/50">
                <div className="flex items-center gap-2 px-3 py-2">
                  <FileCode2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <button
                    type="button"
                    onClick={() => setPreviewing((p) => (p === f.filename ? null : f.filename))}
                    className="flex-1 text-left text-sm font-mono hover:underline flex items-center gap-1"
                  >
                    {f.filename}
                    {previewing === f.filename ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button type="button" onClick={() => removeFile(f.filename)} className="flex-shrink-0">
                    <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
                {previewing === f.filename && (
                  <pre className="text-xs font-mono bg-white border-t p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre">
                    {f.content}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}

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
