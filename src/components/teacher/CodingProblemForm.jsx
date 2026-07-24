import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus } from "lucide-react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import CodeMirror from "@uiw/react-codemirror";
import { java } from "@codemirror/lang-java";
import { a11yLightEditorTheme } from "@/lib/codeEditorThemes";
import MethodEditor, { newMethod } from "./MethodEditor";
import { generateKey } from "./TestCaseEditor";

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

function defaultForm() {
  return {
    title: "",
    description_html: "",
    class_name: "Solution",
    starter_code: "",
    methods: [newMethod()],
    is_active: true,
  };
}

function hydrateMethod(m) {
  return {
    ...m,
    _uid: m._uid || generateKey(),
    method_arg_types: m.method_arg_types || [],
    test_cases: (m.test_cases || []).map((tc) => (tc._uid ? tc : { ...tc, _uid: generateKey() })),
  };
}

export default function CodingProblemForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(
    initial
      ? {
          ...initial,
          methods: initial.methods?.length ? initial.methods.map(hydrateMethod) : [newMethod()],
        }
      : defaultForm()
  );

  const updateField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const addMethod = () => {
    setForm((f) => ({ ...f, methods: [...f.methods, newMethod()] }));
  };

  const removeMethod = (idx) => {
    if (form.methods.length <= 1) return;
    setForm((f) => ({ ...f, methods: f.methods.filter((_, i) => i !== idx) }));
  };

  const updateMethod = (idx, patch) => {
    setForm((f) => {
      const methods = [...f.methods];
      methods[idx] = { ...methods[idx], ...patch };
      return { ...f, methods };
    });
  };

  const pointsPossible = form.methods.reduce(
    (sum, m) => sum + m.test_cases.reduce((s, tc) => s + (Number(tc.points) || 0), 0),
    0
  );

  const nameCounts = form.methods.reduce((acc, m) => {
    const key = m.method_name.trim();
    if (key) acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const nameErrorFor = (m) => {
    if (!m.method_name.trim()) return "Required.";
    if (nameCounts[m.method_name.trim()] > 1) return "Duplicate name — each method needs a unique name.";
    return null;
  };
  const hasMethodNameErrors = form.methods.some((m) => nameErrorFor(m));

  const hasTestCaseIdErrors = form.methods.some((m) => {
    const idCounts = m.test_cases.reduce((acc, tc) => {
      acc[tc.id] = (acc[tc.id] || 0) + 1;
      return acc;
    }, {});
    return m.test_cases.some((tc) => !tc.id || idCounts[tc.id] > 1);
  });

  const isValid = form.title.trim() && form.class_name.trim() && !hasMethodNameErrors && !hasTestCaseIdErrors;

  const handleSubmit = () => {
    if (!isValid) return;
    onSave({
      ...form,
      language: "java",
      methods: form.methods.map(({ _uid, ...m }) => ({
        ...m,
        method_arg_types: m.method_arg_types.map((t) => t.trim()).filter(Boolean),
        test_cases: m.test_cases.map(({ _uid, ...tc }) => tc),
      })),
      points_possible: pointsPossible,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Problem Title *</Label>
          <Input
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="e.g. CREATE: Password Generator"
          />
        </div>
        <div className="space-y-2">
          <Label>Class Name *</Label>
          <Input
            value={form.class_name}
            onChange={(e) => updateField("class_name", e.target.value)}
            placeholder="Solution"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Students must name their public class exactly this.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Problem Description</Label>
        <div className="min-h-[150px]">
          <ReactQuill
            value={form.description_html || ""}
            onChange={(val) => updateField("description_html", val)}
            modules={QUILL_MODULES}
            formats={QUILL_FORMATS}
            placeholder="Describe the problem the student needs to solve..."
            className="bg-white"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Starter Code (shown to students)</Label>
        <div className="border rounded-md overflow-hidden">
          <CodeMirror
            value={form.starter_code || ""}
            onChange={(value) => updateField("starter_code", value)}
            placeholder={`public class ${form.class_name || "Solution"} {\n\n}`}
            extensions={CODE_EXTENSIONS}
            theme="none"
            minHeight="250px"
            basicSetup={{ tabSize: 4 }}
          />
        </div>
      </div>

      <div className="border-t pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Methods</h3>
            <p className="text-xs text-muted-foreground">
              {pointsPossible} point{pointsPossible !== 1 ? "s" : ""} possible across {form.methods.length} method
              {form.methods.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={addMethod}>
            <Plus className="w-4 h-4 mr-1" /> Add Method
          </Button>
        </div>

        <div className="space-y-4">
          {form.methods.map((m, i) => (
            <MethodEditor
              key={m._uid}
              method={m}
              index={i}
              onUpdate={(patch) => updateMethod(i, patch)}
              onRemove={() => removeMethod(i)}
              canRemove={form.methods.length > 1}
              nameError={nameErrorFor(m)}
            />
          ))}
        </div>
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
          {initial ? "Save Changes" : "Create Problem"}
        </Button>
      </div>
    </div>
  );
}
