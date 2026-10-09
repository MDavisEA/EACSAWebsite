import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// What a class teaches decides what it can hold, so it is chosen once, here,
// when the class is made - and shown but not editable afterwards (changing it
// under existing work would leave that work with nowhere to live).
const LANGUAGES = [
  {
    value: "java",
    title: "Java",
    blurb: "AP CSA - FRQ practice, auto-graded Mini Problems, Coding Assignments and Projects turned in as a Gist.",
  },
  {
    value: "processing",
    title: "Processing",
    blurb: "AP CSP - students paste their sketch and upload their images; you run it and give feedback right on the page.",
  },
];

export default function CourseForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || "");
  const [language, setLanguage] = useState(initial?.language || "java");

  const isValid = name.trim();
  const save = () => onSave(initial ? { name: name.trim() } : { name: name.trim(), language });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Course Name *</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={language === "processing" ? "e.g. AP CSP - Period 5" : "e.g. AP CSA - Period 3"}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && isValid && save()}
        />
        <p className="text-xs text-muted-foreground">
          Teaching the same project to several sections? Either make one course per section, or one
          course holding everyone - whichever matches how you want submissions grouped.
        </p>
      </div>

      <div className="space-y-2">
        <Label>What are they programming in?</Label>
        {initial ? (
          <p className="text-sm">
            <span className="font-medium">{LANGUAGES.find((l) => l.value === language)?.title}</span>
            <span className="text-muted-foreground"> - set when the class was created and can't be changed.</span>
          </p>
        ) : (
          <div className="grid gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => setLanguage(l.value)}
                className={`text-left border rounded-lg p-3 transition-colors ${
                  language === l.value ? "border-primary bg-primary/5" : "hover:border-primary/40"
                }`}
              >
                <p className="font-medium text-sm">{l.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{l.blurb}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!isValid}>
          {initial ? "Save Changes" : "Create Course"}
        </Button>
      </div>
    </div>
  );
}
