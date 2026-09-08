import React, { useState, useRef, useEffect } from "react";
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

// A teacher pasting a Java file from wherever they copied it from (an IDE, a
// gist, a doc) almost never remembers to click the code-block toolbar button
// first - and whatever formatting the source carried (bold keywords, italic
// comments, sometimes color) rides along as regular rich text instead,
// stripped of color but keeping the bold/italic, which is worse than plain.
// Recognizing that shape up front and inserting it as an actual code block
// means it comes in clean and gets real syntax colors once saved (see
// highlightNoteCode.js), without the teacher having to know that step exists.
function looksLikeJava(text) {
  return text.includes("\n") && /\bpublic\s+class\b|\bpublic\s+static\s+void\s+main\b|\bimport\s+java\./.test(text);
}

// Scoped to a single, already-open course - unlike Assignment/Coding/Project
// forms there is no course picker here, since a note only ever gets created
// from inside that course's own Notes tab.
export default function NoteForm({ initial, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [contentHtml, setContentHtml] = useState(initial?.content_html || "");
  const [isPublished, setIsPublished] = useState(initial?.is_published || false);
  const quillRef = useRef(null);

  useEffect(() => {
    const quill = quillRef.current?.getEditor?.();
    if (!quill) return;
    const root = quill.root;
    const handlePaste = (e) => {
      const text = e.clipboardData?.getData("text/plain") || "";
      if (!looksLikeJava(text)) return; // let Quill handle a normal rich paste
      e.preventDefault();
      e.stopPropagation();
      const range = quill.getSelection(true);
      quill.deleteText(range.index, range.length, "user");
      quill.insertText(range.index, text, "user");
      quill.formatLine(range.index, text.length, "code-block", true, "user");
      quill.setSelection(range.index + text.length, 0, "user");
    };
    // Capture phase, ahead of Quill's own paste listener on the same root -
    // this has to run (and preventDefault) before Quill's default rich-paste
    // handling touches the clipboard data.
    root.addEventListener("paste", handlePaste, true);
    return () => root.removeEventListener("paste", handlePaste, true);
  }, []);

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
        <div className="dark-quill">
          <ReactQuill
            ref={quillRef}
            value={contentHtml}
            onChange={setContentHtml}
            modules={QUILL_MODULES}
            formats={QUILL_FORMATS}
            placeholder="Paste or write your notes..."
          />
        </div>
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
