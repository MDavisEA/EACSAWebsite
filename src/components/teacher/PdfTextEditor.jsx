import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, Pencil, Check } from "lucide-react";
import HighlightableText from "@/components/exam/HighlightableText";

/**
 * Teacher correction mode for extracted PDF HTML.
 * Shows a preview (what students see) and an edit mode where
 * the teacher can tweak the raw HTML.
 */
export default function PdfTextEditor({ html, onChange }) {
  const [mode, setMode] = useState("preview"); // "preview" | "edit"
  const [draft, setDraft] = useState(html);

  const handleSave = () => {
    onChange(draft);
    setMode("preview");
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          {mode === "preview" ? "Student Preview" : "Edit Extracted Text"}
        </span>
        <div className="flex gap-2">
          {mode === "edit" ? (
            <>
              <Button size="sm" variant="outline" onClick={() => { setDraft(html); setMode("preview"); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Check className="w-3 h-3 mr-1" /> Save
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => { setDraft(html); setMode("edit"); }}>
              <Pencil className="w-3 h-3 mr-1" /> Edit / Correct
            </Button>
          )}
        </div>
      </div>

      {mode === "preview" ? (
        <div className="p-4 max-h-[500px] overflow-y-auto">
          <HighlightableText html={html} />
        </div>
      ) : (
        <div className="p-3 space-y-2">
          <p className="text-xs text-slate-400">
            You can edit the HTML directly below. Use <code className="bg-slate-100 px-1 rounded">&lt;br/&gt;</code> for line breaks,
            wrap code in <code className="bg-slate-100 px-1 rounded">&lt;code&gt;...&lt;/code&gt;</code>, and
            use <code className="bg-slate-100 px-1 rounded">&lt;strong&gt;</code> / <code className="bg-slate-100 px-1 rounded">&lt;em&gt;</code> for formatting.
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full h-64 font-mono text-xs border border-slate-200 rounded p-3 resize-y focus:outline-none focus:ring-1 focus:ring-primary"
            spellCheck={false}
          />
          <p className="text-xs text-slate-400">
            Switch to preview to see what students will see. Highlights work in preview mode.
          </p>
        </div>
      )}
    </div>
  );
}