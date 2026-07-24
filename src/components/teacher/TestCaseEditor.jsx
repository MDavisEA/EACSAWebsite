import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, EyeOff } from "lucide-react";

export const PROPERTY_CHECK_KINDS = [
  { value: "min_length", label: "Minimum length", needsParam: true, paramLabel: "Minimum length", paramDefault: 8 },
  { value: "max_length", label: "Maximum length", needsParam: true, paramLabel: "Maximum length", paramDefault: 20 },
  { value: "contains_upper", label: "Contains an uppercase letter", needsParam: false },
  { value: "contains_lower", label: "Contains a lowercase letter", needsParam: false },
  { value: "contains_digit", label: "Contains a digit", needsParam: false },
  { value: "contains_special", label: "Contains a special character", needsParam: false },
  { value: "no_repeated_chars_over", label: "No repeated-character run longer than…", needsParam: true, paramLabel: "Max run length", paramDefault: 2 },
  { value: "trial_variety", label: "Outputs are varied across trials (not hardcoded)", needsParam: true, paramLabel: "Min % of trials that must be unique", paramDefault: 80 },
];

export function slugify(text) {
  return (
    (text || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || ""
  );
}

export function generateKey() {
  return Math.random().toString(36).substr(2, 9);
}

export function newTestCase(harnessType, methodArgCount = 0) {
  const base = { _uid: generateKey(), id: "", label: "", hidden: false, points: 1 };
  if (harnessType === "exact_match") {
    return { ...base, check_kind: "exact_output", method_args: Array(methodArgCount).fill(""), expected_output: "" };
  }
  return { ...base, check_kind: "min_length", param: 8 };
}

// onUpdate always takes a single patch object to merge, even for a lone
// field - some changes here (label+id, check_kind+param) touch two fields
// at once, and a caller reading test-case state from a prop (not local
// React state) can't safely absorb two separate onUpdate calls in a row.
export default function TestCaseEditor({ testCase, index, harnessType, methodArgTypes, onUpdate, onRemove, canRemove, idError }) {
  const handleLabelChange = (value) => {
    onUpdate(testCase.id ? { label: value } : { label: value, id: slugify(value) });
  };

  const handleCheckKindChange = (kind) => {
    const meta = PROPERTY_CHECK_KINDS.find((k) => k.value === kind);
    onUpdate({ check_kind: kind, param: meta?.needsParam ? meta.paramDefault : undefined });
  };

  const updateMethodArg = (argIdx, value) => {
    const args = [...(testCase.method_args || [])];
    args[argIdx] = value;
    onUpdate({ method_args: args });
  };

  const checkKindMeta = PROPERTY_CHECK_KINDS.find((k) => k.value === testCase.check_kind);

  return (
    <div className="border rounded-lg bg-slate-50/50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <span className="text-xs font-semibold text-slate-400 w-6">#{index + 1}</span>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Label (shown to students)</Label>
            <Input
              value={testCase.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g. Password is at least 8 characters"
              className="h-8 text-sm w-64"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Test ID</Label>
            <Input
              value={testCase.id}
              onChange={(e) => onUpdate({ id: slugify(e.target.value) })}
              placeholder="unique_id"
              className={`h-8 text-sm w-36 font-mono ${idError ? "border-destructive" : ""}`}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Points</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={testCase.points ?? 1}
              onChange={(e) => onUpdate({ points: e.target.value === "" ? 0 : parseInt(e.target.value) })}
              className="h-8 text-sm w-20 text-center"
            />
          </div>
          <div className="flex items-center gap-1.5 pt-4">
            <Switch checked={!!testCase.hidden} onCheckedChange={(v) => onUpdate({ hidden: v })} className="scale-90" />
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <EyeOff className="w-3 h-3" /> Hidden
            </Label>
          </div>
        </div>
        {canRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        )}
      </div>
      {idError && <p className="text-xs text-destructive">{idError}</p>}

      {harnessType === "exact_match" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">
              Arguments {methodArgTypes.length === 0 && "(method takes no arguments)"}
            </Label>
            {methodArgTypes.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {methodArgTypes.map((t, i) => (
                  <Input
                    key={i}
                    value={testCase.method_args?.[i] ?? ""}
                    onChange={(e) => updateMethodArg(i, e.target.value)}
                    placeholder={t || `arg ${i + 1}`}
                    className="h-8 text-sm w-32 font-mono"
                  />
                ))}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Enter raw values (no quotes needed for Strings — they're quoted automatically).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Expected Output</Label>
            <Input
              value={testCase.expected_output ?? ""}
              onChange={(e) => onUpdate({ expected_output: e.target.value })}
              placeholder="Exact return value, as a string"
              className="h-8 text-sm font-mono"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Check Type</Label>
            <Select value={testCase.check_kind} onValueChange={handleCheckKindChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_CHECK_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {checkKindMeta?.needsParam && (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">{checkKindMeta.paramLabel}</Label>
              <Input
                type="number"
                min="0"
                value={testCase.param ?? checkKindMeta.paramDefault}
                onChange={(e) => onUpdate({ param: e.target.value === "" ? checkKindMeta.paramDefault : parseInt(e.target.value) })}
                className="h-8 text-sm w-32"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
