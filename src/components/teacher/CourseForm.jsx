import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function CourseForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || "");

  const isValid = name.trim();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Course Name *</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. AP CSA - Period 3"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && isValid && onSave({ name: name.trim() })}
        />
        <p className="text-xs text-muted-foreground">
          Teaching the same project to several sections? Either make one course per section, or one
          course holding everyone - whichever matches how you want submissions grouped.
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSave({ name: name.trim() })} disabled={!isValid}>
          {initial ? "Save Changes" : "Create Course"}
        </Button>
      </div>
    </div>
  );
}
