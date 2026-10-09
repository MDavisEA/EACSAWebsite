import React, { useState } from "react";
import SketchRunner from "@/components/SketchRunner";
import { Button } from "@/components/ui/button";
import { useSketchAssets } from "@/lib/processing/useSketchAssets";
import { downloadSketchZip } from "@/lib/processing/exportSketch";
import { AlertTriangle, Download, FileCode, Info, Loader2, Terminal } from "lucide-react";

// The "Testing" half of a sketch's grading window: the student's code, running,
// with the files they uploaded. Same Feedback / Testing toggle as a Coding
// Assignment (see CodeReviewGrader), where reading and running are tabs rather
// than a split because each wants the whole width.
//
// `submission` needs { id, student_name, files }. Files are read from the
// snapshot taken when they turned it in - editing nothing here changes it.

export function FeedbackTestingToggle({ tab, onTab, className = "" }) {
  return (
    <div className={`flex items-center gap-1 border rounded-lg p-1 bg-slate-50 ${className}`}>
      {[
        { id: "feedback", label: "Feedback", Icon: FileCode },
        { id: "testing", label: "Testing", Icon: Terminal },
      ].map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onTab(id)}
          className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors ${
            tab === id ? "bg-white shadow-sm font-medium text-slate-900" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Icon className="w-4 h-4" /> {label}
        </button>
      ))}
    </div>
  );
}

export default function SketchTestingPanel({ submission, projectTitle, height = 560 }) {
  const { status, assets, error } = useSketchAssets(submission?.id);
  const [report, setReport] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const files = submission?.files;
  const hasCode = (files || []).some((f) => (f.content || "").trim());
  const missing = (report?.missing || []).filter(
    (m) => !assets.some((a) => a.name.toLowerCase() === m.name.toLowerCase())
  );

  const download = async () => {
    setExporting(true);
    setExportError("");
    try {
      await downloadSketchZip({ studentName: submission.student_name, projectTitle, files, assets });
    } catch (e) {
      setExportError(e.message || "Couldn't build the download.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-slate-100 px-3 py-1.5 border-b flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium">Running {submission?.student_name}&rsquo;s sketch</span>
        {status === "loading" && (
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading their files...
          </span>
        )}
        {status === "ready" && (
          <span className="text-xs text-muted-foreground">
            {assets.length} uploaded file{assets.length === 1 ? "" : "s"}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden md:flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> Runs in your browser. If it looks wrong, open it in real Processing.
          </span>
          <Button size="sm" variant="outline" className="h-7" onClick={download} disabled={exporting || !hasCode}>
            {exporting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
            Download for Processing
          </Button>
        </span>
      </div>

      {(error || exportError) && <p className="text-sm text-destructive px-3 py-2 border-b">{error || exportError}</p>}

      {missing.length > 0 && (
        <div className="px-3 py-2 border-b bg-amber-50 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Their code asks for {missing.map((m) => m.name).join(", ")}, which they never uploaded - that part
            won&rsquo;t show.
          </span>
        </div>
      )}

      {!hasCode ? (
        <p className="text-sm text-muted-foreground p-6 text-center">There is no code to run — they turned this in empty.</p>
      ) : status === "loading" || status === "idle" ? (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground" style={{ height }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Getting their sketch ready...
        </div>
      ) : (
        <div style={{ height }}>
          <SketchRunner
            // A new student (or a re-fetched set of files) is a clean start.
            resetKey={submission.id}
            files={files}
            assets={assets}
            autoRun
            onReport={setReport}
            className="h-full bg-white"
          />
        </div>
      )}
      <div className="bg-slate-50 border-t px-3 py-1.5 text-xs text-muted-foreground">
        A scratch run — nothing here changes what they turned in. Their saved code is what you see on the Feedback tab.
      </div>
    </div>
  );
}
