import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Trash2 } from "lucide-react";
import TestCaseEditor, { newTestCase, generateKey } from "./TestCaseEditor";

export function newMethod() {
  return {
    _uid: generateKey(),
    method_name: "",
    harness_type: "property_check",
    method_arg_types: [],
    trial_count: 30,
    test_cases: [newTestCase("property_check")],
  };
}

// onUpdate takes a partial object to merge (not a single field/value pair)
// so multi-field changes - like switching check type, which also resets
// test_cases - land in one atomic update rather than two separate calls
// racing against the same stale parent state.
export default function MethodEditor({ method, index, onUpdate, onRemove, canRemove, nameError }) {
  const handleHarnessChange = (value) => {
    if (value === method.harness_type) return;
    if (method.test_cases.length > 0) {
      const ok = window.confirm(
        "Switching the check type will clear this method's existing test cases, since they're structured differently. Continue?"
      );
      if (!ok) return;
    }
    onUpdate({ harness_type: value, test_cases: [newTestCase(value, method.method_arg_types.length)] });
  };

  const addArgType = () => {
    onUpdate({
      method_arg_types: [...method.method_arg_types, ""],
      test_cases: method.test_cases.map((tc) =>
        tc.method_args ? { ...tc, method_args: [...tc.method_args, ""] } : tc
      ),
    });
  };

  const removeArgType = (idx) => {
    onUpdate({
      method_arg_types: method.method_arg_types.filter((_, i) => i !== idx),
      test_cases: method.test_cases.map((tc) =>
        tc.method_args ? { ...tc, method_args: tc.method_args.filter((_, i) => i !== idx) } : tc
      ),
    });
  };

  const updateArgType = (idx, value) => {
    const types = [...method.method_arg_types];
    types[idx] = value;
    onUpdate({ method_arg_types: types });
  };

  const addTestCase = () => {
    onUpdate({ test_cases: [...method.test_cases, newTestCase(method.harness_type, method.method_arg_types.length)] });
  };

  const removeTestCase = (idx) => {
    if (method.test_cases.length <= 1) return;
    onUpdate({ test_cases: method.test_cases.filter((_, i) => i !== idx) });
  };

  const updateTestCase = (idx, patch) => {
    const tcs = [...method.test_cases];
    tcs[idx] = { ...tcs[idx], ...patch };
    onUpdate({ test_cases: tcs });
  };

  const pointsPossible = method.test_cases.reduce((sum, tc) => sum + (Number(tc.points) || 0), 0);

  const idCounts = method.test_cases.reduce((acc, tc) => {
    acc[tc.id] = (acc[tc.id] || 0) + 1;
    return acc;
  }, {});
  const idErrorFor = (tc) => {
    if (!tc.id) return "Required — used to match results back to this test.";
    if (idCounts[tc.id] > 1) return "Duplicate ID — each test case needs a unique ID.";
    return null;
  };

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-slate-50/50">
      <div className="flex items-start justify-between gap-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Method Name *</Label>
            <Input
              value={method.method_name}
              onChange={(e) => onUpdate({ method_name: e.target.value })}
              placeholder="e.g. generatePassword"
              className={`font-mono ${nameError ? "border-destructive" : ""}`}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Check Type</Label>
            <Select value={method.harness_type} onValueChange={handleHarnessChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exact_match">Exact output match</SelectItem>
                <SelectItem value="property_check">Randomized property check</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {canRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove} title="Remove method">
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {method.harness_type === "exact_match"
          ? "Calls the method once per test case with fixed arguments and compares the return value exactly."
          : "Calls a zero-argument method many times and checks properties of the outputs (e.g. length, variety) — good for randomized methods."}
      </p>

      {method.harness_type === "exact_match" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-500">Method Argument Types (in order)</Label>
            <Button variant="outline" size="sm" onClick={addArgType}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Argument
            </Button>
          </div>
          {method.method_arg_types.length === 0 ? (
            <p className="text-xs text-muted-foreground">Method takes no arguments.</p>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {method.method_arg_types.map((t, i) => (
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
        <div className="space-y-1 max-w-xs">
          <Label className="text-xs text-slate-500">Trials per submission</Label>
          <Input
            type="number"
            min="1"
            value={method.trial_count ?? 30}
            onChange={(e) => onUpdate({ trial_count: e.target.value === "" ? 30 : parseInt(e.target.value) })}
          />
        </div>
      )}

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-slate-600">
            Test Cases — {pointsPossible} point{pointsPossible !== 1 ? "s" : ""} possible
          </p>
          <Button variant="outline" size="sm" onClick={addTestCase}>
            <Plus className="w-4 h-4 mr-1" /> Add Test Case
          </Button>
        </div>
        <div className="space-y-3">
          {method.test_cases.map((tc, i) => (
            <TestCaseEditor
              key={tc._uid}
              testCase={tc}
              index={i}
              harnessType={method.harness_type}
              methodArgTypes={method.method_arg_types}
              onUpdate={(patch) => updateTestCase(i, patch)}
              onRemove={() => removeTestCase(i)}
              canRemove={method.test_cases.length > 1}
              idError={idErrorFor(tc)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
