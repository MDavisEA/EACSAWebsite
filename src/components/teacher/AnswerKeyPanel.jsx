import React from "react";
import { KeyRound, ZoomIn } from "lucide-react";

// One question or part's answer key. Extracted from SubmissionViewer so the
// grading queue shows exactly the same thing rather than a second, slightly
// different rendering that drifts the first time either is touched.
//
// The image is a button rather than a plain <img> because keys are often
// photographed rubric pages that are unreadable at column width - `onZoom`
// hands the URL back so the caller can open it in whatever lightbox it already
// has, instead of this component owning a dialog.
//
// `quill-render` alongside `prose` is load-bearing: this project has no
// Tailwind typography plugin, so `prose` alone leaves every bulleted list in a
// teacher-written key as unmarked lines.
export default function AnswerKeyPanel({ keyHtml, keyImageUrl, onZoom }) {
  if (!keyHtml && !keyImageUrl) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1 flex items-center gap-1">
        <KeyRound className="w-3 h-3" /> Answer Key
      </p>
      <div className="border border-amber-200 rounded-lg bg-amber-50/40 p-4 text-sm">
        {keyHtml && (
          <div
            className="prose prose-sm max-w-none quill-render"
            dangerouslySetInnerHTML={{ __html: keyHtml }}
          />
        )}
        {keyImageUrl && (
          <button onClick={() => onZoom?.(keyImageUrl)} className="mt-2 block group relative">
            <img
              src={keyImageUrl}
              alt="Answer key"
              className="max-w-full rounded border group-hover:opacity-90 transition-opacity"
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="bg-black/50 rounded-full p-2">
                <ZoomIn className="w-5 h-5 text-white" />
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
