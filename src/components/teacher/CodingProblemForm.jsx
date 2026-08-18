import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import CodeMirror from "@uiw/react-codemirror";
import { java } from "@codemirror/lang-java";
import { a11yLightEditorTheme } from "@/lib/codeEditorThemes";
import MethodEditor, { newMethod } from "./MethodEditor";
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
    // New problems start in "check the output" mode: it is the one that works
    // before students are writing methods at all.
    methods: [
      {
        _uid: generateKey(),
        method_name: "Program output",
        harness_type: "program_output",
        method_arg_types: [],
        trial_count: 30,
        test_cases: [newTestCase("program_output")],
      },
    ],
    course_id: null,
    unit_id: null,
    grading_kind: "auto",
    manual_points: 10,
    answer_key_code: "",
    answer_key_notes_html: "",
    due_date: "",
    max_test_runs: 5,
    is_active: true,
  };
}

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time, while
// due_date round-trips through Postgres as a UTC ISO string.
function toLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hydrateMethod(m) {
  // Ids are generated and never shown, so a problem written before that -
  // or one with a duplicate id - is repaired quietly on open. Validating
  // instead would be a dead end: there is no longer a field to fix it in.
  const seen = new Set();
  return {
    ...m,
    _uid: m._uid || generateKey(),
    method_arg_types: m.method_arg_types || [],
    test_cases: (m.test_cases || []).map((tc) => {
      const id = tc.id && !seen.has(tc.id) ? tc.id : `chk_${generateKey()}`;
      seen.add(id);
      return { ...tc, id, _uid: tc._uid || generateKey() };
    }),
  };
}

export default function CodingProblemForm({ initial, courses = [], onSave, onCancel }) {
  // `initial` may be a seed carrying only course_id/unit_id/grading_kind for a
  // new problem, so an id - not mere presence - is what marks an actual edit.
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(
    isEdit
      ? {
          ...defaultForm(),
          ...initial,
          due_date: toLocalInputValue(initial.due_date),
          methods: initial.methods?.length ? initial.methods.map(hydrateMethod) : [newMethod()],
        }
      // Spread the whole seed, not just course_id/unit_id - it used to drop
      // grading_kind here, so every "New Coding Assignment" silently created
      // an ordinary autograded problem instead (the dashboard's seed sets
      // grading_kind: "review", but this branch threw it away before the
      // form ever saw it).
      : { ...defaultForm(), ...initial }
  );

  // A Coding Assignment is the same row as a Mini Problem with grading_kind
  // 'review': no test cases, the teacher marks it by hand. Branching here
  // keeps one form instead of a near-duplicate of it.
  const isReview = form.grading_kind === "review";

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
  // Two ways to grade, chosen at the top of the form. Underneath, both still
  // store `methods[]` - "check the output" is just a single group the teacher
  // never sees, so the word "method" never appears for a problem that has
  // none. Derived rather than stored so existing problems classify correctly
  // without a migration.
  const gradingMode =
    form.methods.length > 0 && form.methods.every((m) => m.harness_type === "program_output")
      ? "output"
      : "methods";

  const OUTPUT_GROUP_NAME = "Program output";
  const outputTestCases = gradingMode === "output" ? form.methods[0]?.test_cases || [] : [];

  const handleGradingModeChange = (mode) => {
    if (mode === gradingMode) return;
    // Only warn if there is something real to lose. A brand-new problem starts
    // with one blank check, and prompting about that just trains people to
    // click through the warning that actually matters.
    const hasWork = form.methods.some(
      (m) =>
        m.method_name?.trim() && m.method_name.trim() !== OUTPUT_GROUP_NAME
          ? true
          : (m.test_cases || []).some(
              (tc) =>
                tc.label?.trim() ||
                tc.id?.trim() ||
                tc.stdin?.trim() ||
                tc.expected_output?.trim()
            )
    );
    if (hasWork) {
      const ok = window.confirm(
        "Switching how this is graded will clear the checks you have set up, since they work differently. Continue?"
      );
      if (!ok) return;
    }
    if (mode === "output") {
      updateField("methods", [
        {
          _uid: generateKey(),
          method_name: OUTPUT_GROUP_NAME,
          harness_type: "program_output",
          method_arg_types: [],
          trial_count: 30,
          test_cases: [newTestCase("program_output")],
        },
      ]);
    } else {
      updateField("methods", [newMethod("property_check")]);
    }
  };

  const setOutputTestCases = (next) =>
    updateField("methods", [
      { ...form.methods[0], method_name: OUTPUT_GROUP_NAME, test_cases: next },
    ]);

  const addOutputCheck = () => setOutputTestCases([...outputTestCases, newTestCase("program_output")]);
  const removeOutputCheck = (idx) => {
    if (outputTestCases.length <= 1) return;
    setOutputTestCases(outputTestCases.filter((_, i) => i !== idx));
  };
  const updateOutputCheck = (idx, patch) =>
    setOutputTestCases(outputTestCases.map((tc, i) => (i === idx ? { ...tc, ...patch } : tc)));

  // A problem graded on its output has no method names to validate, and the
  // one group name is set by this form rather than typed.
  const hasMethodNameErrors =
    !isReview && gradingMode === "methods" && form.methods.some((m) => nameErrorFor(m));

  // The grader wraps student code in its own `public class Main`, so a problem
  // named Main would put two classes of that name in one file and every
  // submission would fail to compile with an error that looks like the
  // student's fault. Especially worth catching now that whole-program problems
  // exist, since Main is exactly what an IDE names a class with a main().
  const classNameError =
    form.class_name.trim() === "Main"
      ? 'Cannot be "Main" — the grader already uses that name internally. Try "Solution".'
      : null;

  // Required for a Mini Problem - the autograder actually calls
  // `<class_name>.<method>()`, so a blank name has nowhere to compile to. A
  // Coding Assignment is graded by hand and only ever uses this to label
  // starter code, so leaving it blank (or deleting it) is harmless and
  // should not block saving - it used to, which meant an accidental delete
  // locked the form.
  const isValid =
    form.title.trim() && (isReview || form.class_name.trim()) && form.course_id && !classNameError && !hasMethodNameErrors;

  const handleSubmit = () => {
    if (!isValid) return;
    onSave({
      ...form,
      language: "java",
      class_name: form.class_name.trim() || "Solution",
      course_id: form.course_id || null,
      unit_id: form.unit_id || null,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      methods: form.methods.map(({ _uid, ...m }) => ({
        ...m,
        method_arg_types: m.method_arg_types.map((t) => t.trim()).filter(Boolean),
        test_cases: m.test_cases.map(({ _uid, ...tc }) => tc),
      })),
      points_possible: isReview ? Number(form.manual_points) || 0 : pointsPossible,
      // A Coding Assignment is graded by hand, not by test runs - the field
      // is hidden from this form for that reason, so it must not silently
      // carry over defaultForm's autograded default of 5.
      max_test_runs: isReview ? null : form.max_test_runs,
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
          <Label>Class Name (for the starter code){isReview ? " (optional)" : ""}</Label>
          <Input
            value={form.class_name}
            onChange={(e) => updateField("class_name", e.target.value)}
            placeholder="Solution"
            className={`font-mono ${classNameError ? "border-destructive" : ""}`}
          />
          {classNameError ? (
            <p className="text-xs text-destructive">{classNameError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {isReview
                ? "Just names the class in the starter code below. You're grading by hand, so nothing checks this - leave it blank and it defaults to \"Solution\"."
                : "Just names the class in the starter code below — students can rename it and their program still gets graded correctly, since nothing here checks for a specific name."}
            </p>
          )}
        </div>
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
          <p className="text-xs text-muted-foreground">Optional — shown to students.</p>
        </div>
      </div>

      {!isReview && (
      <div className="space-y-2 max-w-xs">
        <Label>Test Runs Allowed</Label>
        <Input
          type="number"
          min="1"
          value={form.max_test_runs ?? ""}
          onChange={(e) =>
            updateField("max_test_runs", e.target.value === "" ? null : parseInt(e.target.value))
          }
          placeholder="Unlimited"
        />
        <p className="text-xs text-muted-foreground">
          How many times a student can hit &ldquo;Run My Tests&rdquo; before submitting. Leave blank
          for unlimited. Submitting is never blocked, even at zero remaining.
        </p>
      </div>
      )}

      {isReview && (
      <div className="space-y-2 max-w-xs">
        <Label>Points *</Label>
        <Input
          type="number"
          min="0"
          value={form.manual_points ?? ""}
          onChange={(e) =>
            updateField("manual_points", e.target.value === "" ? "" : parseInt(e.target.value))
          }
        />
        <p className="text-xs text-muted-foreground">
          What this is out of. There are no automatic checks — you score it yourself while reading
          the code.
        </p>
      </div>
      )}

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

      {/* A reference solution. Kept out of everything students can reach until
          it is released - see sanitizeForStudent. Offered for both kinds: it
          helps while grading either, and it is what students check their own
          work against afterwards. */}
      <div className="space-y-2 border-t pt-6">
        <Label>Answer key (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Your solution. You see it while grading; students only ever see it after you release it
          with the Key switch on this assignment&rsquo;s card, and only on work they have already
          turned in.
        </p>
        <div className="border rounded-md overflow-hidden">
          <CodeMirror
            value={form.answer_key_code || ""}
            onChange={(value) => updateField("answer_key_code", value)}
            placeholder={`public class ${form.class_name || "Solution"} {\n    // your solution\n}`}
            extensions={CODE_EXTENSIONS}
            theme="none"
            minHeight="180px"
            basicSetup={{ tabSize: 4 }}
          />
        </div>
        <Label className="text-xs text-slate-500">Notes on the key (optional)</Label>
        <div className="min-h-[110px]">
          <ReactQuill
            value={form.answer_key_notes_html || ""}
            onChange={(val) => updateField("answer_key_notes_html", val)}
            modules={QUILL_MODULES}
            formats={QUILL_FORMATS}
            placeholder="What to look for, common wrong turns, what earns partial credit..."
            className="bg-white"
          />
        </div>
      </div>

      {isReview ? (
        <div className="border-t pt-6">
          <p className="text-sm font-medium mb-1">Graded by hand</p>
          <p className="text-xs text-muted-foreground">
            Students write and submit code; nothing is checked automatically. When you open a
            submission you can run it, see its output, and leave comments on specific lines.
          </p>
        </div>
      ) : (
      <div className="border-t pt-6 space-y-4">
        <div className="space-y-2">
          <Label>How should this be graded? *</Label>
          <Select value={gradingMode} onValueChange={handleGradingModeChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="output">Check what the program prints</SelectItem>
              <SelectItem value="methods">Test specific methods</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {gradingMode === "output"
              ? "You give the program some input, and say what has to show up in what it prints. Use this when students write everything in main() — no methods required."
              : "You call methods the student wrote and check what they return. Use this once students are writing their own methods."}
          </p>
        </div>

        {gradingMode === "output" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">What to check</h3>
                <p className="text-xs text-muted-foreground">
                  {pointsPossible} point{pointsPossible !== 1 ? "s" : ""} possible across{" "}
                  {outputTestCases.length} check{outputTestCases.length !== 1 ? "s" : ""}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={addOutputCheck}>
                <Plus className="w-4 h-4 mr-1" /> Add Check
              </Button>
            </div>

            <div className="space-y-3">
              {outputTestCases.map((tc, i) => (
                <TestCaseEditor
                  key={tc._uid}
                  testCase={tc}
                  index={i}
                  harnessType="program_output"
                  methodArgTypes={[]}
                  onUpdate={(patch) => updateOutputCheck(i, patch)}
                  onRemove={() => removeOutputCheck(i)}
                  canRemove={outputTestCases.length > 1}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
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
        )}
      </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t pt-4">
        <Switch checked={form.is_active} onCheckedChange={(v) => updateField("is_active", v)} />
        <Label>Active (visible to students)</Label>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!isValid}>
          {isEdit ? "Save Changes" : isReview ? "Create Coding Assignment" : "Create Problem"}
        </Button>
      </div>
    </div>
  );
}
