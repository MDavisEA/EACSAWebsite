import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Loader2, ChevronRight } from "lucide-react";
import HighlightedCode from "@/components/HighlightedCode";

// The graded attempt(s) archived when a student turned this back in - see
// reopenMine on the server. Read-only: this is history, not something to
// grade again. Fetched on demand rather than carried on every submission,
// since most submissions never have any. Shared by every grading surface
// (GradingQueue, CodeReviewGrader) rather than each keeping its own copy.
export default function PreviousVersionsPanel({ submissionId }) {
  const [versions, setVersions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openIndex, setOpenIndex] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setVersions(null);
    setOpenIndex(null);
    setLoading(true);
    (async () => {
      try {
        const results = await base44.entities.Submission.listVersions(submissionId);
        if (!cancelled) setVersions(results);
      } catch {
        if (!cancelled) setVersions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [submissionId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading previous attempts...
      </div>
    );
  }
  if (!versions || versions.length === 0) return null;

  return (
    <div className="border border-blue-200 bg-blue-50/50 rounded-lg divide-y divide-blue-200 mb-3">
      {versions.map((v, i) => {
        const snap = v.snapshot || {};
        const open = openIndex === i;
        return (
          <div key={v.id}>
            <button
              onClick={() => setOpenIndex(open ? null : i)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-blue-100/50 transition-colors"
            >
              <span className="font-medium text-blue-800">
                Attempt from {format(new Date(v.archived_at), "MMM d, h:mm a")}
              </span>
              {snap.score != null && (
                <span className="text-blue-700">Scored {snap.score}</span>
              )}
              <ChevronRight className={`w-3.5 h-3.5 ml-auto transition-transform ${open ? "rotate-90" : ""}`} />
            </button>
            {open && (
              <div className="p-3 space-y-2">
                {snap.code && <HighlightedCode code={snap.code} className="rounded p-2 overflow-x-auto max-h-56 overflow-y-auto" />}
                {snap.teacher_comments && (
                  <div className="text-xs whitespace-pre-wrap bg-white border rounded p-2">
                    {snap.teacher_comments}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
