import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { base44 } from "@/api/base44Client";
import { openLinksInNewTab } from "@/lib/quillConfig";
import { googleDocEmbedUrl } from "@/lib/googleDoc";
import {
  ACCEPT_ATTR, MAX_ASSET_BYTES, MAX_ASSETS_TOTAL_BYTES, assetFromBlob, formatBytes, loadAssets,
} from "@/lib/processing/assets";
import SketchRunner from "@/components/SketchRunner";
import SampleOutputs from "@/components/SampleOutputs";
import ResizableDivider from "@/components/exam/ResizableDivider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, CheckCircle2, ExternalLink, FileImage, Loader2, MessageSquare, Plus, Send, Upload, X,
} from "lucide-react";

// A Processing sketch assignment, from the student's side: code on the left,
// the running sketch on the right. Students write and test in real Processing
// on their own machine and paste the result in here - this page exists so the
// teacher can run and grade it without opening each student's files - so the
// editor is deliberately a plain text area, with a local draft so a refresh
// never loses a paste.

const MAIN_TAB_DEFAULT = "Sketch";

function safeTabName(raw) {
  let s = String(raw || "").replace(/\.pde$/i, "").replace(/[^A-Za-z0-9_]/g, "_");
  if (!/^[A-Za-z_]/.test(s)) s = `_${s}`;
  return s.slice(0, 60) || MAIN_TAB_DEFAULT;
}

// Names go through the same cleanup the server applies on turn-in, so a tab
// called "my-game" is "my_game" here too and a re-open doesn't look edited.
const toTabs = (files) => (files || []).map((f) => ({ name: safeTabName(f.filename), code: f.content }));
const toFiles = (tabs) => tabs.map((t) => ({ filename: `${t.name}.pde`, content: t.code }));

function readDraft(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    if (raw?.tabs?.length && raw.tabs.every((t) => typeof t.name === "string" && typeof t.code === "string")) return raw;
  } catch {
    // storage unavailable or corrupt: just start from the submission
  }
  return null;
}

function initialTabs(draftKey, submission, project) {
  const draft = readDraft(draftKey);
  // A draft wins over the turned-in copy - it holds edits made since - unless
  // the turn-in is NEWER (they turned it in from another computer since this
  // draft was last touched), in which case the draft is the stale one.
  const turnedInAt = submission?.submitted_at ? new Date(submission.submitted_at).getTime() : 0;
  if (draft && !(turnedInAt && turnedInAt > (draft.savedAt || 0))) return draft.tabs;
  if ((submission?.files || []).length) return toTabs(submission.files);
  const starter = (project.starter_files || []).filter((f) => /\.pde$/i.test(f.filename));
  if (starter.length) return toTabs(starter);
  return [{ name: MAIN_TAB_DEFAULT, code: "" }];
}

export default function SketchWorkspace({ project, submission, draftKey, onSubmitted, onBack }) {
  const [tabs, setTabs] = useState(() => initialTabs(draftKey, submission, project));
  const [active, setActive] = useState(0);
  const [view, setView] = useState("code"); // code | assignment
  const [split, setSplit] = useState(46);

  const [assets, setAssets] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(!!submission?.id);
  const [assetError, setAssetError] = useState("");
  const [uploading, setUploading] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [report, setReport] = useState(null);

  const [submitOpen, setSubmitOpen] = useState(false);
  const [aiHelpUsed, setAiHelpUsed] = useState(submission?.ai_help_used ?? null);
  const [aiHelpLink, setAiHelpLink] = useState(submission?.ai_help_link || "");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [renaming, setRenaming] = useState(null);

  const runnerRef = useRef(null);
  const pickerRef = useRef(null);

  // ---- draft: every edit is kept locally, so a refresh or a closed tab never loses a paste ----
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ tabs, savedAt: Date.now() }));
    } catch {
      // private window / storage full - the page still works, it just can't remember
    }
  }, [tabs, draftKey]);

  const files = useMemo(() => toFiles(tabs), [tabs]);
  const hasCode = tabs.some((t) => t.code.trim());
  const submitted = !!submission?.submitted;
  const changedSinceSubmit = useMemo(() => {
    if (!submitted) return false;
    return JSON.stringify(toTabs(submission.files || [])) !== JSON.stringify(tabs);
  }, [submitted, submission?.files, tabs]);

  // ---- existing uploaded files ----
  useEffect(() => {
    if (!submission?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const rows = await base44.entities.SketchAsset.list(submission.id);
        const loaded = await loadAssets(rows);
        if (!cancelled) setAssets(loaded);
      } catch (e) {
        if (!cancelled) setAssetError(e.message || "Couldn't load your uploaded files.");
      } finally {
        if (!cancelled) setAssetsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [submission?.id]);

  const totalAssetBytes = assets.reduce((sum, a) => sum + a.size, 0);

  const addAssetFiles = async (fileList) => {
    if (!submission?.id) return;
    setAssetError("");
    for (const file of Array.from(fileList)) {
      const lower = file.name.toLowerCase();
      const replacing = assets.find((a) => a.name.toLowerCase() === lower);
      if (file.size > MAX_ASSET_BYTES) {
        setAssetError(`${file.name} is ${formatBytes(file.size)} - the limit is ${formatBytes(MAX_ASSET_BYTES)} per file.`);
        continue;
      }
      if (totalAssetBytes - (replacing?.size || 0) + file.size > MAX_ASSETS_TOTAL_BYTES) {
        setAssetError(`Adding ${file.name} would go over ${formatBytes(MAX_ASSETS_TOTAL_BYTES)} of files in total.`);
        continue;
      }
      setUploading((u) => [...u, file.name]);
      try {
        const row = await base44.entities.SketchAsset.upload(submission.id, file);
        const asset = await assetFromBlob(row.name, file, { id: row.id, size: row.size_bytes });
        setAssets((prev) =>
          [...prev.filter((a) => a.name.toLowerCase() !== row.name.toLowerCase()), asset]
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      } catch (e) {
        setAssetError(e.message || `Couldn't upload ${file.name}.`);
      } finally {
        setUploading((u) => u.filter((n) => n !== file.name));
      }
    }
  };

  const removeAsset = async (asset) => {
    setAssetError("");
    try {
      await base44.entities.SketchAsset.remove(submission.id, asset.id);
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    } catch (e) {
      setAssetError(e.message || `Couldn't remove ${asset.name}.`);
    }
  };

  // ---- editing ----
  const setCode = (code) => setTabs((prev) => prev.map((t, i) => (i === active ? { ...t, code } : t)));

  const addTab = () => {
    setTabs((prev) => {
      let n = prev.length + 1;
      while (prev.some((t) => t.name.toLowerCase() === `tab${n}`)) n++;
      return [...prev, { name: `Tab${n}`, code: "" }];
    });
    setActive(tabs.length);
  };

  const deleteTab = (i) => {
    setTabs((prev) => prev.filter((_, j) => j !== i));
    setActive((a) => Math.max(0, Math.min(a, tabs.length - 2)));
  };

  const finishRename = (i, raw) => {
    const name = safeTabName(raw);
    setRenaming(null);
    if (tabs.some((t, j) => j !== i && t.name.toLowerCase() === name.toLowerCase())) return;
    setTabs((prev) => prev.map((t, j) => (j === i ? { ...t, name } : t)));
  };

  const onEditorKeyDown = (e) => {
    if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const el = e.target;
      const { selectionStart: s, selectionEnd: en } = el;
      setCode(`${el.value.slice(0, s)}  ${el.value.slice(en)}`);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
    }
  };

  const doRun = useCallback(() => {
    setReport(null);
    runnerRef.current?.run();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); doRun(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doRun]);

  // ---- turn in ----
  const aiHelpAnswered = aiHelpUsed !== null && (aiHelpUsed === false || aiHelpLink.trim() !== "");
  const missingNow = (report?.missing || []).filter(
    (m) => !assets.some((a) => a.name.toLowerCase() === m.name.toLowerCase())
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const sub = await base44.entities.Submission.submitSketch(project.id, files, aiHelpUsed, aiHelpLink.trim() || null);
      onSubmitted(sub);
      setSubmitOpen(false);
    } catch (e) {
      setSubmitError(e.message || "Something went wrong turning that in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const due = project.due_date ? new Date(project.due_date) : null;
  const pastDue = due && due < new Date();
  const hasFeedback = !!submission?.feedback_released && (submission.score != null || (submission.teacher_comments || "").trim());
  const current = tabs[Math.min(active, tabs.length - 1)];

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <header className="flex items-center gap-3 px-4 py-2 bg-white border-b flex-wrap">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> My Work
        </button>
        <div className="min-w-0">
          <h1 className="font-semibold leading-tight truncate">{project.title}</h1>
          {due && (
            <p className={`text-xs ${pastDue ? "text-destructive" : "text-muted-foreground"}`}>
              Due {due.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              {pastDue && " - past due, submissions are marked late"}
            </p>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3 flex-wrap justify-end">
          {hasFeedback && (
            <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:underline">
              <MessageSquare className="w-3.5 h-3.5" /> Your teacher left feedback
            </button>
          )}
          {submitted ? (
            changedSinceSubmit ? (
              <span className="text-xs text-amber-700">Turned in, but you've changed it since</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                <CheckCircle2 className="w-4 h-4" /> Turned in {new Date(submission.submitted_at).toLocaleString()}
              </span>
            )
          ) : (
            <span className="text-xs text-muted-foreground">Not turned in yet</span>
          )}
          <Button onClick={() => { setSubmitError(""); setSubmitOpen(true); }} disabled={!hasCode}>
            <Send className="w-4 h-4 mr-1.5" />
            {submitted ? "Turn in again" : "Turn in"}
          </Button>
        </div>
      </header>

      <div id="sketch-split" className="flex-1 min-h-0 flex">
        {/* ---------------- left: code / assignment ---------------- */}
        <div className="flex flex-col min-w-0 bg-white" style={{ width: `${split}%` }}>
          <div className="flex items-center gap-1 px-3 pt-2 border-b">
            {[["code", "Code"], ["assignment", "Assignment"]].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`px-3 py-1.5 text-sm rounded-t-md border-b-2 -mb-px transition-colors ${
                  view === id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-muted-foreground pb-1.5">Run: Ctrl/Cmd + Enter</span>
          </div>

          {view === "assignment" ? (
            <div className="flex-1 overflow-auto p-5 space-y-5">
              {project.description_html && (
                <div
                  className="prose prose-sm max-w-none quill-render"
                  dangerouslySetInnerHTML={{ __html: openLinksInNewTab(project.description_html) }}
                />
              )}
              {project.google_doc_url && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Directions (Google Doc)</h2>
                    <a href={project.google_doc_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                      Open in new tab <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <iframe src={googleDocEmbedUrl(project.google_doc_url)} title="Assignment directions" className="w-full rounded-lg border" style={{ height: 480 }} />
                </div>
              )}
              {(project.sample_outputs || []).length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sample output</h2>
                  <SampleOutputs items={project.sample_outputs} />
                </div>
              )}
              {project.rubric_md && (
                <div>
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Rubric</h2>
                  <div className="text-sm markdown-render"><ReactMarkdown>{project.rubric_md}</ReactMarkdown></div>
                </div>
              )}
              {!project.description_html && !project.google_doc_url && !project.rubric_md && (
                <p className="text-sm text-muted-foreground">Your teacher didn't add directions for this one.</p>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-end gap-0.5 px-2 pt-1.5 bg-slate-50 border-b overflow-x-auto">
                {tabs.map((t, i) => (
                  <div
                    key={i}
                    onClick={() => setActive(i)}
                    onDoubleClick={() => setRenaming(i)}
                    className={`group flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-t-md border border-b-0 cursor-pointer whitespace-nowrap ${
                      i === active ? "bg-white font-medium" : "bg-slate-100 text-muted-foreground hover:text-foreground"
                    }`}
                    title={i === 0 ? "Your main sketch tab. Double-click to rename." : "Double-click to rename"}
                  >
                    {renaming === i ? (
                      <input
                        autoFocus
                        defaultValue={t.name}
                        className="w-28 text-sm border rounded px-1"
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => finishRename(i, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setRenaming(null); }}
                      />
                    ) : (
                      <span>{t.name}.pde</span>
                    )}
                    {i > 0 && (
                      <X
                        className="w-3 h-3 opacity-40 hover:opacity-100 hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); deleteTab(i); }}
                      />
                    )}
                  </div>
                ))}
                <button onClick={addTab} className="px-2 py-1.5 text-muted-foreground hover:text-foreground" title="Add a tab">
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <textarea
                value={current?.code || ""}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={onEditorKeyDown}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                placeholder="Paste your Processing code here, then press Run."
                className="flex-1 min-h-[120px] w-full resize-none outline-none p-3 font-mono text-[13px] leading-6 whitespace-pre overflow-auto"
              />

              {/* ---- files (the sketch's data/ folder) ---- */}
              <div
                className={`border-t p-3 space-y-2 max-h-[40%] overflow-auto ${dragOver ? "bg-primary/5" : "bg-slate-50/60"}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); addAssetFiles(e.dataTransfer.files); }}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold uppercase tracking-wide text-muted-foreground">Files</span>
                  <span className="text-muted-foreground">
                    Images or anything else your code loads, like <code>loadImage("ship.png")</code>
                  </span>
                  <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => pickerRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5 mr-1.5" /> Add files
                  </Button>
                  <input
                    ref={pickerRef}
                    type="file"
                    multiple
                    accept={ACCEPT_ATTR}
                    hidden
                    onChange={(e) => { addAssetFiles(e.target.files); e.target.value = ""; }}
                  />
                </div>

                {assetError && <p className="text-xs text-destructive">{assetError}</p>}

                {missingNow.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {missingNow.map((m) => (
                      <span key={m.name} className="text-xs font-mono rounded bg-red-50 text-red-700 px-2 py-0.5">
                        needs {m.name}
                      </span>
                    ))}
                  </div>
                )}

                {assetsLoading ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your files...</p>
                ) : assets.length === 0 && uploading.length === 0 ? (
                  <p className="text-xs text-muted-foreground border-2 border-dashed rounded-lg py-3 text-center">
                    Drop files here, or press Add files. Up to {formatBytes(MAX_ASSET_BYTES)} each.
                  </p>
                ) : (
                  <ul className="grid gap-1">
                    {assets.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 text-sm bg-white border rounded-md px-2 py-1">
                        <FileImage className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="font-mono text-xs truncate flex-1" title={a.name}>{a.name}</span>
                        <span className="text-xs text-muted-foreground">{formatBytes(a.size)}</span>
                        {report && (
                          <span className={`text-[11px] ${report.used?.includes(a.name) ? "text-emerald-600" : "text-muted-foreground"}`}>
                            {report.used?.includes(a.name) ? "used" : "not used"}
                          </span>
                        )}
                        <button onClick={() => removeAsset(a)} className="text-muted-foreground hover:text-destructive" title="Remove">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                    {uploading.map((n) => (
                      <li key={`up-${n}`} className="flex items-center gap-2 text-sm bg-white border rounded-md px-2 py-1 opacity-70">
                        <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                        <span className="font-mono text-xs truncate flex-1">{n}</span>
                        <span className="text-xs text-muted-foreground">uploading...</span>
                      </li>
                    ))}
                  </ul>
                )}
                {assets.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {assets.length} file{assets.length === 1 ? "" : "s"}, {formatBytes(totalAssetBytes)} of {formatBytes(MAX_ASSETS_TOTAL_BYTES)}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <ResizableDivider containerId="sketch-split" leftPercent={split} onResize={setSplit} />

        {/* ---------------- right: the running sketch ---------------- */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <SketchRunner
            ref={runnerRef}
            className="h-full"
            files={files}
            assets={assets}
            resetKey={project.id}
            onReport={setReport}
          />
        </div>
      </div>

      <Dialog open={submitOpen} onOpenChange={(o) => !submitting && setSubmitOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{submitted ? "Turn in again?" : "Turn in your sketch"}</DialogTitle>
            <DialogDescription>
              {tabs.length} tab{tabs.length === 1 ? "" : "s"} of code and {assets.length} file{assets.length === 1 ? "" : "s"}.
              {submitted && " This replaces what you turned in before."}
            </DialogDescription>
          </DialogHeader>

          {missingNow.length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Your code asks for {missingNow.map((m) => m.name).join(", ")}, which you haven't added. Your sketch won't show
              {missingNow.length === 1 ? " it" : " them"} when your teacher runs it.
            </p>
          )}

          <div className="space-y-2">
            <Label>Did you get help from an AI chatbot on this?</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={aiHelpUsed === false ? "default" : "outline"} onClick={() => { setAiHelpUsed(false); setAiHelpLink(""); }}>
                No
              </Button>
              <Button type="button" size="sm" variant={aiHelpUsed === true ? "default" : "outline"} onClick={() => setAiHelpUsed(true)}>
                Yes
              </Button>
            </div>
            {aiHelpUsed === true && (
              <Input autoFocus placeholder="Paste a link to your AI conversation..." value={aiHelpLink} onChange={(e) => setAiHelpLink(e.target.value)} />
            )}
          </div>

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setSubmitOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting || !aiHelpAnswered || !hasCode}>
              {submitting ? "Turning in..." : submitted ? "Turn in again" : "Turn in"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
