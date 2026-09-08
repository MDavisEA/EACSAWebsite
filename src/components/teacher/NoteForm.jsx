import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

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

// Scoped to a single, already-open course - unlike Assignment/Coding/Project
// forms there is no course picker here, since a note only ever gets created
// from inside that course's own Notes tab.
export default function NoteForm({ initial, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [contentHtml, setContentHtml] = useState(initial?.content_html || "");
  const [isPublished, setIsPublished] = useState(initial?.is_published || false);

  const isValid = title.trim().length > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    onSave({ title, content_html: contentHtml, is_published: isPublished });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Recursion" />
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <ReactQuill
          value={contentHtml}
          onChange={setContentHtml}
          modules={QUILL_MODULES}
          formats={QUILL_FORMATS}
          placeholder="Paste or write your notes..."
          className="bg-white"
        />
      </div>

      <div className="flex items-center gap-3 pt-2 border-t pt-4">
        <Switch checked={isPublished} onCheckedChange={setIsPublished} />
        <Label>Published (visible to students in this class)</Label>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!isValid}>
          {initial ? "Save Changes" : "Create Note"}
        </Button>
      </div>
    </div>
  );
}
