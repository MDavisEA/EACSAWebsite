import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  // The id is generated, never typed. It only exists to match a result back
  // to the check that produced it, so it carries no meaning for the teacher -
  // asking them to invent a unique string was busywork with a validation
  // error attached. Generated rather than slugified from the label so that
  // renaming a check can never collide with another one.
  const base = { _uid: generateKey(), id: `chk_${generateKey()}`, label: "", hidden: false, points: 1 };
  if (harnessType === "exact_match") {
    return { ...base, check_kind: "exact_output", method_args: Array(methodArgCount).fill(""), expected_output: "" };
  }
  if (harnessType === "program_output") {
    return { ...base, check_kind: "output_contains", stdin: "", expected_output: "", ignore_case: false };
  }
  return { ...base, check_kind: "min_length", param: 8 };
}

// onUpdate always takes a single patch object to merge, even for a lone
// field - some changes here (label+id, check_kind+param) touch two fields
// at once, and a caller reading test-case state from a prop (not local
// React state) can't safely absorb two separate onUpdate calls in a row.
export default function TestCaseEditor({ testCase, index, harnessType, methodArgTypes, onUpdate, onRemove, canRemove }) {
  // Whole-program checks compare either raw text or the value as a number.
  // Case-insensitivity is meaningless for a number, so that toggle hides.
  const isNumberCheck = testCase.check_kind === "output_contains_number";
  // Relation checks compare two numbers found in the output to each other, so
  // there is no single expected value to type.
  const isRelationCheck = testCase.check_kind === "output_number_relation";
  const isCountCheck = testCase.check_kind === "output_repeat_count";

  // Legacy checks predate generated ids; fill one in on first edit so an old
  // problem cannot be saved with a blank id.
  const handleLabelChange = (value) => {
    onUpdate(testCase.id ? { label: value } : { label: value, id: `chk_${generateKey()}` });
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

      {harnessType === "program_output" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Input typed into the program</Label>
            <Textarea
              value={testCase.stdin ?? ""}
              onChange={(e) => onUpdate({ stdin: e.target.value })}
              placeholder={"One value per line, e.g.\n3\n4"}
              className="text-sm font-mono min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              One value per line — this is what Scanner reads. Leave blank if the program takes no input.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Output must contain</Label>
            <div className="flex gap-2">
              <Select
                value={
                  testCase.check_kind === "output_contains_number"
                    ? "number"
                    : testCase.check_kind === "output_number_relation"
                    ? "relation"
                    : testCase.check_kind === "output_repeat_count"
                    ? "count"
                    : "text"
                }
                onValueChange={(v) =>
                  onUpdate({
                    check_kind:
                      v === "number"
                        ? "output_contains_number"
                        : v === "relation"
                        ? "output_number_relation"
                        : v === "count"
                        ? "output_repeat_count"
                        : "output_contains",
                    ...(v === "relation" ? { relation_op: testCase.relation_op || "times" } : {}),
                    ...(v === "count"
                      ? {
                          count_op: testCase.count_op || "exactly",
                          count_value: testCase.count_value ?? "",
                        }
                      : {}),
                  })
                }
              >
                <SelectTrigger className="h-8 text-sm w-[112px] flex-shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">this text</SelectItem>
                  <SelectItem value="number">this number</SelectItem>
                  <SelectItem value="count">this text, N times</SelectItem>
                  <SelectItem value="relation">math that checks out</SelectItem>
                </SelectContent>
              </Select>
              {!isRelationCheck && (
                <Input
                  value={testCase.expected_output ?? ""}
                  onChange={(e) => onUpdate({ expected_output: e.target.value })}
                  placeholder={isNumberCheck ? "e.g. 1500.00" : "e.g. Total"}
                  className="h-8 text-sm font-mono"
                />
              )}
            </div>

            {isRelationCheck ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <span className="text-muted-foreground">the number after</span>
                  <Input
                    value={testCase.relation_b ?? ""}
                    onChange={(e) => onUpdate({ relation_b: e.target.value })}
                    placeholder="You made $"
                    className="h-8 text-sm font-mono w-40"
                  />
                  <span className="text-muted-foreground">=</span>
                  <span className="text-muted-foreground">the number after</span>
                  <Input
                    value={testCase.relation_a ?? ""}
                    onChange={(e) => onUpdate({ relation_a: e.target.value })}
                    placeholder="Today you sold"
                    className="h-8 text-sm font-mono w-40"
                  />
                  <Select
                    value={testCase.relation_op || "times"}
                    onValueChange={(v) => onUpdate({ relation_op: v })}
                  >
                    <SelectTrigger className="h-8 text-sm w-[92px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="times">×</SelectItem>
                      <SelectItem value="divided">÷</SelectItem>
                      <SelectItem value="plus">+</SelectItem>
                      <SelectItem value="minus">−</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={testCase.relation_value ?? ""}
                    onChange={(e) => onUpdate({ relation_value: e.target.value })}
                    placeholder="3.99"
                    className="h-8 text-sm font-mono w-24"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  For programs with random numbers in them. It doesn&rsquo;t care what the numbers
                  are — only that they add up, on every line. A student who prints a total without
                  actually computing it fails this.
                </p>
              </div>
            ) : (
              <>
                {isCountCheck && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">appears</span>
                    <Select
                      value={testCase.count_op || "exactly"}
                      onValueChange={(v) => onUpdate({ count_op: v })}
                    >
                      <SelectTrigger className="h-8 text-sm w-[104px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exactly">exactly</SelectItem>
                        <SelectItem value="at_least">at least</SelectItem>
                        <SelectItem value="at_most">at most</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      value={testCase.count_value ?? ""}
                      onChange={(e) => onUpdate({ count_value: e.target.value })}
                      placeholder="5"
                      className="h-8 text-sm w-20 text-center"
                    />
                    <span className="text-muted-foreground">times</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {isCountCheck
                    ? "Counts how many times this shows up. Good for checking a loop ran the right number of times — if they enter 5 days, a line from inside the loop should appear 5 times."
                    : isNumberCheck
                    ? "Compared as a number, so 1500, 1500.0, 1500.00 and $1,500.00 all count. Use this for any answer they calculate — it stops correct work failing over formatting."
                    : "Passes as long as this appears somewhere in what they print, so they can word the rest however they like."}
                </p>
                {!isNumberCheck && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <Switch
                      checked={!!testCase.ignore_case}
                      onCheckedChange={(v) => onUpdate({ ignore_case: v })}
                      className="scale-90"
                    />
                    <Label className="text-xs text-slate-500">Ignore capitalization</Label>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : harnessType === "exact_match" ? (
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

      <div className="space-y-1.5 pt-1 border-t">
        <Label className="text-xs text-slate-500">If they fail this, tell them (optional)</Label>
        <Input
          value={testCase.fail_message ?? ""}
          onChange={(e) => onUpdate({ fail_message: e.target.value })}
          placeholder="e.g. Check that your loop runs once for each day they asked for."
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Shown to the student only when this check fails — including on hidden checks, so point
          them at the mistake without giving away the answer.
        </p>
      </div>
    </div>
  );
}
