import React, { useEffect, useMemo, useState } from "react";
import SketchRunner from "@/components/SketchRunner";
import { Button } from "@/components/ui/button";
import { useSketchAssets } from "@/lib/processing/useSketchAssets";
import { downloadSketchZip } from "@/lib/processing/exportSketch";
import { baseName, groupFilesByPart } from "@/lib/processing/programs";
import { AlertTriangle, Download, FileCode, Info, Loader2, Terminal } from "lucide-react";

// The "Testing" half of a sketch's grading window: the student's code, running,
// with the files they uploaded. Same Feedback / Testing toggle as a Coding
// Assignment (see CodeReviewGrader), where reading and running are tabs rather
// than a split because each wants the whole width.
//
// `submission` needs { id, student_name, files }. Files are read from the
// snapshot taken when they turned it in - editing nothing here changes it.
// `parts` is the assignment's list of programs (empty = a single program); with
// several, a picker chooses which one runs.

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

export default function SketchTestingPanel({ submission, projectTitle, parts = [], height = 560 }) {
  const { status, assets, error } = useSketchAssets(submission?.id);
  const [report, setReport] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const groups = useMemo(
    () => groupFilesByPart(submission?.files, parts).filter((g) => g.files.some((f) => (f.content || "").trim())),
    [submission?.files, parts]
  );
  // Which program is running. A new student starts on their first program; a
  // stale key (the program was removed) falls back the same way.
  const [pick, setPick] = useState(null);
  useEffect(() => setPick(null), [submission?.id]);
  const group = groups.find((g) => g.key === pick) || groups[0];
  const files = useMemo(
    () => (group?.files || []).map((f) => ({ filename: baseName(f.filename), content: f.content })),
    [group]
  );
  const hasCode = groups.length > 0;
  const multi = parts.length > 0 || groups.length > 1;
  const missing = (report?.missing || []).filter(
    (m) => !assets.some((a) => a.name.toLowerCase() === m.name.toLowerCase())
  );

  const download = async () => {
    setExporting(true);
    setExportError("");
    try {
      await downloadSketchZip({
        studentName: submission.student_name,
        projectTitle,
        programs: groups.map((g) => ({
          title: multi ? g.title : null,
          files: g.files.map((f) => ({ filename: baseName(f.filename), content: f.content })),
        })),
        assets,
      });
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

      {multi && groups.length > 0 && (
        <div className="px-3 py-1.5 border-b flex items-center gap-1 flex-wrap bg-white">
          <span className="text-xs text-muted-foreground mr-1">Program:</span>
          {groups.map((g, i) => (
            <button
              key={g.key}
              onClick={() => setPick(g.key)}
              className={`text-xs rounded-md px-2.5 py-1 border transition-colors ${
                g.key === group?.key ? "bg-slate-900 text-white border-slate-900" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {i + 1}. {g.title || "Code"}
            </button>
          ))}
          {parts.length > groups.length && (
            <span className="text-xs text-muted-foreground ml-2">
              {parts.length - groups.length} not turned in
            </span>
          )}
        </div>
      )}

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
            resetKey={`${submission.id}:${group?.key}`}
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
