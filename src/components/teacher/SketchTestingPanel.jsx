import React, { useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { java } from "@codemirror/lang-java";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { a11yDarkEditorTheme } from "@/lib/codeEditorThemes";
import { useCodeFontSize } from "@/lib/useCodeFontSize";
import SketchRunner from "@/components/SketchRunner";
import { Button } from "@/components/ui/button";
import { useSketchAssets } from "@/lib/processing/useSketchAssets";
import { downloadSketchZip } from "@/lib/processing/exportSketch";
import { baseName, groupFilesByPart } from "@/lib/processing/programs";
import { AlertTriangle, Download, FileCode, Info, Loader2, Pencil, Play, RotateCcw, Terminal } from "lucide-react";

// The "Testing" half of a sketch's grading window: the student's code, running,
// with the files they uploaded. Same Feedback / Testing toggle as a Coding
// Assignment (see CodeReviewGrader), where reading and running are tabs rather
// than a split because each wants the whole width.
//
// `submission` needs { id, student_name, files }. Files are read from the
// snapshot taken when they turned it in - editing nothing here changes it.
// `parts` is the assignment's list of programs (empty = a single program); with
// several, a picker chooses which one runs.

// Scratch edits: the teacher can change a student's code to see what happens. They live
// only in this browser tab (this map), keyed by submission + program, so they survive
// flipping between Output and Code and between programs, and are never sent anywhere -
// what the student turned in is never touched.
const scratch = new Map();

// For a sketch the two halves are "Output" (the running program - what you
// open to by default, since that is what you are marking) and "Code" (their
// source, with line comments). Same two tab ids as a Coding Assignment's
// Feedback / Testing, so everything keyed on those keeps working.
export function FeedbackTestingToggle({ tab, onTab, className = "", sketch = false }) {
  const items = sketch
    ? [
        { id: "testing", label: "Output", Icon: Play },
        { id: "feedback", label: "Code", Icon: FileCode },
      ]
    : [
        { id: "feedback", label: "Feedback", Icon: FileCode },
        { id: "testing", label: "Testing", Icon: Terminal },
      ];
  return (
    <div className={`flex items-center gap-1 border rounded-lg p-1 bg-slate-50 ${className}`}>
      {items.map(({ id, label, Icon }) => (
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

export default function SketchTestingPanel({ submission, projectTitle, parts = [], height = 560, selectedKey, onSelect }) {
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
  // Controlled when the parent passes selectedKey/onSelect (so the Output and Code
  // views of a grading window stay on the same program); otherwise it keeps its
  // own choice and starts over for each new student.
  const [innerPick, setInnerPick] = useState(null);
  const lastId = useRef(submission?.id);
  if (lastId.current !== submission?.id) { lastId.current = submission?.id; if (innerPick !== null) setInnerPick(null); if (editing) setEditing(false); }
  const controlled = selectedKey !== undefined;
  const pick = controlled ? selectedKey : innerPick;
  const setPick = controlled ? onSelect : setInnerPick;
  const group = groups.find((g) => g.key === pick) || groups[0];
  const files = useMemo(
    () => (group?.files || []).map((f) => ({ filename: baseName(f.filename), content: f.content })),
    [group]
  );
  const hasCode = groups.length > 0;
  // ---- scratch editing ("what happens if I change this?") ----
  const scratchKey = `${submission?.id}:${group?.key}`;
  const edited = scratch.get(scratchKey) || null;
  const runFiles = edited || files;
  const [editing, setEditing] = useState(false);
  const [tabIdx, setTabIdx] = useState(0);
  const [resetCount, setResetCount] = useState(0);
  const [, rerender] = useState(0);
  const runnerRef = useRef(null);
  const runHandler = useRef(() => {});
  runHandler.current = () => runnerRef.current?.run();
  const { fontSize } = useCodeFontSize();
  // Built once: a new extensions array rebuilds the editor and drops the cursor.
  const editorExtensions = useMemo(
    () => [
      java(),
      ...a11yDarkEditorTheme,
      keymap.of([indentWithTab]),
      Prec.highest(keymap.of([{ key: "Mod-Enter", run: () => { runHandler.current(); return true; } }])),
    ],
    []
  );
  const tab = Math.min(tabIdx, Math.max(0, runFiles.length - 1));
  const setCode = (code) => {
    scratch.set(scratchKey, runFiles.map((f, i) => (i === tab ? { ...f, content: code } : f)));
    rerender((n) => n + 1);
  };
  const resetEdits = () => {
    scratch.delete(scratchKey);
    setResetCount((n) => n + 1);
    // Run their original again once it has been put back.
    setTimeout(() => runnerRef.current?.run(), 0);
  };
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
          <Button
            size="sm"
            variant={editing ? "default" : "outline"}
            className="h-7"
            onClick={() => setEditing((e) => !e)}
            disabled={!hasCode}
            title="Change their code to see what happens. Nothing is saved."
          >
            <Pencil className="w-3.5 h-3.5 mr-1.5" /> {editing ? "Done editing" : "Edit code"}
          </Button>
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
            {submission?.assets_purged_at
              ? `Their uploaded images were removed on ${new Date(submission.assets_purged_at).toLocaleDateString()}, a week after grading, to save space - so ${missing.map((m) => m.name).join(", ")} won't show.`
              : `Their code asks for ${missing.map((m) => m.name).join(", ")}, which they never uploaded - that part won't show.`}
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
        <div style={{ height }} className="flex">
          {editing && (
            <div className="w-1/2 min-w-0 flex flex-col border-r">
              <div className="bg-amber-50 border-b px-3 py-1 text-xs text-amber-900 flex items-center gap-2 flex-wrap">
                <span>Try changing it, then Run (Ctrl/Cmd + Enter). Your changes are never saved.</span>
                {edited && (
                  <button onClick={resetEdits} className="ml-auto inline-flex items-center gap-1 font-medium underline hover:text-amber-950">
                    <RotateCcw className="w-3 h-3" /> Back to their code
                  </button>
                )}
              </div>
              {runFiles.length > 1 && (
                <div className="flex gap-1 px-2 pt-1 bg-slate-50 border-b">
                  {runFiles.map((f, i) => (
                    <button
                      key={f.filename}
                      onClick={() => setTabIdx(i)}
                      className={`text-xs font-mono px-2.5 py-1 rounded-t-md border border-b-0 ${
                        i === tab ? "bg-white font-semibold" : "bg-slate-100 text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {f.filename}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex-1 min-h-0 overflow-hidden" style={{ "--code-editor-font-size": `${fontSize}px` }}>
                <CodeMirror
                  key={`${scratchKey}:${tab}:${resetCount}`}
                  value={runFiles[tab]?.content || ""}
                  onChange={setCode}
                  theme="none"
                  extensions={editorExtensions}
                  height="100%"
                  style={{ height: "100%" }}
                  basicSetup={{ tabSize: 2 }}
                />
              </div>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <SketchRunner
              ref={runnerRef}
              // A new student (or a re-fetched set of files) is a clean start.
              resetKey={`${submission.id}:${group?.key}`}
              files={runFiles}
              assets={assets}
              autoRun
              onReport={setReport}
              className="h-full bg-white"
            />
          </div>
        </div>
      )}
      <div className="bg-slate-50 border-t px-3 py-1.5 text-xs text-muted-foreground">
        A scratch run — nothing here changes what they turned in. Their saved code is on the Code tab.
        {edited && <span className="text-amber-700 font-medium"> You are running a version you edited.</span>}
      </div>
    </div>
  );
}
