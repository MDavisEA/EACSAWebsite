import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import CodeMirror from "@uiw/react-codemirror";
import { java } from "@codemirror/lang-java";
import { a11yLightEditorTheme } from "@/lib/codeEditorThemes";
import TestCaseEditor, { newTestCase, generateKey } from "./TestCaseEditor";

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
    harness_type: "property_check",
    method_name: "",
    method_arg_types: [],
    trial_count: 30,
    test_cases: [newTestCase("property_check")],
    is_active: true,
  };
}

export default function CodingProblemForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(
    initial
      ? {
          ...initial,
          method_arg_types: initial.method_arg_types || [],
          test_cases: initial.test_cases?.length
            ? initial.test_cases.map((tc) => (tc._uid ? tc : { ...tc, _uid: generateKey() }))
            : [newTestCase(initial.harness_type)],
        }
      : defaultForm()
  );

  const updateField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleHarnessChange = (value) => {
    if (value === form.harness_type) return;
    if (form.test_cases.length > 0) {
      const ok = window.confirm(
        "Switching the check type will clear the existing test cases, since they're structured differently. Continue?"
      );
      if (!ok) return;
    }
    setForm((f) => ({
      ...f,
      harness_type: value,
      test_cases: [newTestCase(value, f.method_arg_types.length)],
    }));
  };

  const addArgType = () => {
    setForm((f) => ({
      ...f,
      method_arg_types: [...f.method_arg_types, ""],
      test_cases: f.test_cases.map((tc) =>
        tc.method_args ? { ...tc, method_args: [...tc.method_args, ""] } : tc
      ),
    }));
  };

  const removeArgType = (idx) => {
    setForm((f) => ({
      ...f,
      method_arg_types: f.method_arg_types.filter((_, i) => i !== idx),
      test_cases: f.test_cases.map((tc) =>
        tc.method_args ? { ...tc, method_args: tc.method_args.filter((_, i) => i !== idx) } : tc
      ),
    }));
  };

  const updateArgType = (idx, value) => {
    const types = [...form.method_arg_types];
    types[idx] = value;
    updateField("method_arg_types", types);
  };

  const addTestCase = () => {
    setForm((f) => ({
      ...f,
      test_cases: [...f.test_cases, newTestCase(f.harness_type, f.method_arg_types.length)],
    }));
  };

  const removeTestCase = (idx) => {
    if (form.test_cases.length <= 1) return;
    setForm((f) => ({ ...f, test_cases: f.test_cases.filter((_, i) => i !== idx) }));
  };

  const updateTestCase = (idx, field, value) => {
    setForm((f) => {
      const tcs = [...f.test_cases];
      tcs[idx] = { ...tcs[idx], [field]: value };
      return { ...f, test_cases: tcs };
    });
  };

  const pointsPossible = form.test_cases.reduce((sum, tc) => sum + (Number(tc.points) || 0), 0);

  const idCounts = form.test_cases.reduce((acc, tc) => {
    acc[tc.id] = (acc[tc.id] || 0) + 1;
    return acc;
  }, {});
  const idErrorFor = (tc) => {
    if (!tc.id) return "Required — used to match results back to this test.";
    if (idCounts[tc.id] > 1) return "Duplicate ID — each test case needs a unique ID.";
    return null;
  };
  const hasIdErrors = form.test_cases.some((tc) => idErrorFor(tc));

  const isValid =
    form.title.trim() && form.method_name.trim() && form.class_name.trim() && !hasIdErrors;

  const handleSubmit = () => {
    if (!isValid) return;
    onSave({
      ...form,
      language: "java",
      method_arg_types: form.method_arg_types.map((t) => t.trim()).filter(Boolean),
      test_cases: form.test_cases.map(({ _uid, ...tc }) => tc),
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
        <h3 className="text-lg font-semibold">Grading Setup</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Check Type</Label>
            <Select value={form.harness_type} onValueChange={handleHarnessChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exact_match">Exact output match</SelectItem>
                <SelectItem value="property_check">Randomized property check</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {form.harness_type === "exact_match"
                ? "Calls the method once per test case with fixed arguments and compares the return value exactly."
                : "Calls a zero-argument method many times and checks properties of the outputs (e.g. length, variety) — good for randomized methods."}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Method Name *</Label>
            <Input
              value={form.method_name}
              onChange={(e) => updateField("method_name", e.target.value)}
              placeholder="e.g. generatePassword"
              className="font-mono"
            />
          </div>
        </div>

        {form.harness_type === "exact_match" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Method Argument Types (in order)</Label>
              <Button variant="outline" size="sm" onClick={addArgType}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Argument
              </Button>
            </div>
            {form.method_arg_types.length === 0 ? (
              <p className="text-xs text-muted-foreground">Method takes no arguments.</p>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {form.method_arg_types.map((t, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input
                      value={t}
                      onChange={(e) => updateArgType(i, e.target.value)}
                      placeholder="int, String, double..."
                      className="h-8 text-sm w-32 font-mono"
                    />
                    <button onClick={() => removeArgType(i)} className="text-slate-400 hover:text-destructive">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 max-w-xs">
            <Label>Trials per submission</Label>
            <Input
              type="number"
              min="1"
              value={form.trial_count ?? 30}
              onChange={(e) => updateField("trial_count", e.target.value === "" ? 30 : parseInt(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">How many times to call the method to check properties.</p>
          </div>
        )}
      </div>

      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Test Cases</h3>
            <p className="text-xs text-muted-foreground">Total: {pointsPossible} point{pointsPossible !== 1 ? "s" : ""} possible</p>
          </div>
          <Button variant="outline" size="sm" onClick={addTestCase}>
            <Plus className="w-4 h-4 mr-1" /> Add Test Case
          </Button>
        </div>

        <div className="space-y-3">
          {form.test_cases.map((tc, i) => (
            <TestCaseEditor
              key={tc._uid}
              testCase={tc}
              index={i}
              harnessType={form.harness_type}
              methodArgTypes={form.method_arg_types}
              onUpdate={(field, value) => updateTestCase(i, field, value)}
              onRemove={() => removeTestCase(i)}
              canRemove={form.test_cases.length > 1}
              idError={idErrorFor(tc)}
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
