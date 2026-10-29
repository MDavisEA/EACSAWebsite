import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { base44 } from "@/api/base44Client";
import { openLinksInNewTab } from "@/lib/quillConfig";
import { googleDocEmbedUrl } from "@/lib/googleDoc";
import {
  ACCEPT_ATTR, MAX_ASSET_BYTES, MAX_ASSETS_TOTAL_BYTES, assetFromBlob, formatBytes, loadAssets,
} from "@/lib/processing/assets";
import { baseName, partIdOf } from "@/lib/processing/programs";
import { findBracketProblems, findMissingSemicolons } from "@/lib/processing/syntaxCheck";
import CodeMirror from "@uiw/react-codemirror";
import { java } from "@codemirror/lang-java";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { autoIndentView } from "@/lib/autoIndent";
import { a11yDarkEditorTheme } from "@/lib/codeEditorThemes";
import CodeFontSizeControl from "@/components/CodeFontSizeControl";
import { useCodeFontSize } from "@/lib/useCodeFontSize";
import SketchRunner from "@/components/SketchRunner";
import SampleOutputs from "@/components/SampleOutputs";
import ResizableDivider from "@/components/exam/ResizableDivider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Eye, FileImage, Loader2, MessageSquare, Plus, Send, Upload, X,
} from "lucide-react";

// A Processing sketch assignment, from the student's side: code on the left,
// the running sketch on the right. Students write and test in real Processing
// on their own machine and paste the result in here - this page exists so the
// teacher can run and grade it without opening each student's files - so the
// editor is deliberately a plain text area, with a local draft so a refresh
// never loses a paste.
//
// An assignment can ask for several programs (a problem set): then there is a
// strip of them above the code, each with its own tabs, and Run runs whichever
// is open. Uploaded files are shared by the whole assignment. With no programs
// listed it is one sketch and the strip never appears.

const MAIN_TAB_DEFAULT = "Sketch";
const SINGLE = "main"; // the one program of an assignment that lists none
const WRITTEN = "__written"; // the step that holds the written questions (not a program)

function safeTabName(raw) {
  let s = String(raw || "").replace(/\.pde$/i, "").replace(/[^A-Za-z0-9_]/g, "_");
  if (!/^[A-Za-z_]/.test(s)) s = `_${s}`;
  return s.slice(0, 60) || MAIN_TAB_DEFAULT;
}

const hasCode = (tabs) => (tabs || []).some((t) => t.code.trim());
const blankProgram = () => [{ name: MAIN_TAB_DEFAULT, code: "" }];

// Stored files -> { [programId]: [{ name, code }] }. Names go through the same
// cleanup the server applies on turn-in, so a tab called "my-game" is "my_game"
// here too and re-opening doesn't look like an edit. A program the teacher has
// since removed has nowhere to live on this page and is dropped.
function programsFromFiles(files, programIds, multi) {
  const out = Object.fromEntries(programIds.map((id) => [id, []]));
  for (const f of files || []) {
    const id = multi ? partIdOf(f) : SINGLE;
    if (!out[id]) continue;
    out[id].push({ name: safeTabName(multi ? baseName(f.filename) : f.filename), code: f.content });
  }
  return out;
}

// What gets turned in: every tab of every program that has any code. Used for
// BOTH the submit payload and the "changed since you turned it in" comparison,
// so the two can never disagree about what counts.
function toSubmission(programs, programIds, multi) {
  const out = [];
  for (const id of programIds) {
    const tabs = programs[id] || [];
    if (!hasCode(tabs)) continue;
    for (const t of tabs) out.push({ ...(multi ? { part: id } : {}), filename: `${t.name}.pde`, content: t.code });
  }
  return out;
}

function readDraft(key) {
  if (!key) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    const ok = (tabs) => Array.isArray(tabs) && tabs.every((t) => typeof t?.name === "string" && typeof t?.code === "string");
    if (raw?.programs && typeof raw.programs === "object" && Object.values(raw.programs).every(ok)) return raw;
    // Drafts saved before assignments could have several programs.
    if (ok(raw?.tabs) && raw.tabs.length) return { programs: { [SINGLE]: raw.tabs }, savedAt: raw.savedAt };
  } catch {
    // storage unavailable or corrupt: just start from the submission
  }
  return null;
}

// Written answers as they are turned in: only questions that exist, only ones with something
// in them. Used for the submit payload AND the "changed since you turned it in" comparison.
function cleanAnswers(answers, questions) {
  const out = {};
  for (const q of questions) {
    const v = answers?.[q.id];
    if (typeof v === "string" && v.trim() !== "") out[q.id] = v;
  }
  return out;
}

// Same rule as the code: a draft wins over the turned-in copy unless the turn-in is newer.
function initialAnswers(draftKey, submission, questions) {
  const draft = readDraft(draftKey);
  const turnedInAt = submission?.submitted_at ? new Date(submission.submitted_at).getTime() : 0;
  const useDraft = draft && draft.answers && !(turnedInAt && turnedInAt > (draft.savedAt || 0));
  return cleanAnswers(useDraft ? draft.answers : submission?.answers, questions);
}

// A program's starter code, as the one tab it opens with (null = start blank).
const starterTabs = (part) => (part?.starter?.trim() ? [{ name: MAIN_TAB_DEFAULT, code: part.starter }] : null);

function initialPrograms(draftKey, submission, project, programIds, multi) {
  const base = Object.fromEntries(programIds.map((id) => [id, blankProgram()]));
  const fill = (source) => {
    for (const id of programIds) {
      if (source[id]?.length) base[id] = source[id];
      // Starter code only for a program nothing has been saved for yet: a draft
      // or a turn-in already has the student's own version, which wins - even if
      // they cleared it on purpose.
      else if (multi) {
        const starter = starterTabs((project.parts || []).find((p) => p.id === id));
        if (starter) base[id] = starter;
      }
    }
    return base;
  };
  const draft = readDraft(draftKey);
  // A draft wins over the turned-in copy - it holds edits made since - unless
  // the turn-in is NEWER (they turned it in from another computer since this
  // draft was last touched), in which case the draft is the stale one.
  const turnedInAt = submission?.submitted_at ? new Date(submission.submitted_at).getTime() : 0;
  if (draft && !(turnedInAt && turnedInAt > (draft.savedAt || 0))) return fill(draft.programs);
  if ((submission?.files || []).length) return fill(programsFromFiles(submission.files, programIds, multi));
  if (!multi) {
    const starter = (project.starter_files || []).filter((f) => /\.pde$/i.test(f.filename));
    if (starter.length) return fill({ [SINGLE]: starter.map((f) => ({ name: safeTabName(f.filename), code: f.content })) });
  }
  // Nothing saved anywhere yet: each program opens on its own starter code (or blank).
  return fill({});
}

// The screenshots a teacher attached to a program ("it should look like this").
// Click one to open it full size in a new tab.
function PartImages({ urls, compact = false }) {
  if (!urls || urls.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "mt-1" : "mt-2"}`}>
      {urls.map((u) => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer" title="Open full size">
          <img
            src={u}
            alt="What this program should look like"
            className={`rounded border bg-white object-contain ${compact ? "max-h-28 max-w-[200px]" : "max-h-72 max-w-full"}`}
          />
        </a>
      ))}
    </div>
  );
}

// A program's instructions, right beside its sample output (the teacher's
// screenshots), so a student can read what to build while looking at what it
// should look like - without flipping to the Assignment tab and back. The text
// takes light Markdown (bullets, bold). Collapsible, because on a small screen
// the code matters more than the reminder once you know the task.
function ProgramBrief({ meta, open, onToggle }) {
  return (
    <div className="border-b bg-slate-50/60">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {open ? "Instructions" : "Show instructions"}
      </button>
      {open && (
        <div className="px-3 pb-2 flex gap-3 items-start max-h-[38vh] overflow-auto">
          {meta.description && (
            <div className="flex-1 min-w-0 text-sm markdown-render">
              <ReactMarkdown>{meta.description}</ReactMarkdown>
            </div>
          )}
          {(meta.images || []).length > 0 && (
            <div className={meta.description ? "flex-none max-w-[48%]" : "flex-1"}>
              <PartImages urls={meta.images} compact />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The written questions: the prompt (light Markdown) and a box for the answer. A question the
// teacher marked as a code answer gets a code font and keeps its spacing; Tab inserts spaces
// there instead of leaving the box.
function WrittenQuestions({ questions, answers, onChange }) {
  return (
    <div className="flex-1 overflow-auto p-5 space-y-5">
      <p className="text-sm text-muted-foreground">
        Answer these in your own words. Your answers are saved on this computer as you type, and turned in with your
        programs.
      </p>
      {questions.map((q, i) => {
        const value = answers[q.id] || "";
        return (
          <div key={q.id} className="space-y-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold">{i + 1}.</span>
              <div className="flex-1 min-w-0 text-sm markdown-render"><ReactMarkdown>{q.prompt}</ReactMarkdown></div>
              {typeof q.points === "number" && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">{q.points} pt{q.points === 1 ? "" : "s"}</span>
              )}
            </div>
            <textarea
              value={value}
              onChange={(e) => onChange(q.id, e.target.value)}
              onKeyDown={(e) => {
                if (!q.code || e.key !== "Tab" || e.shiftKey) return;
                e.preventDefault();
                const el = e.target;
                const next = `${value.slice(0, el.selectionStart)}  ${value.slice(el.selectionEnd)}`;
                const caret = el.selectionStart + 2;
                onChange(q.id, next);
                requestAnimationFrame(() => el.setSelectionRange(caret, caret));
              }}
              spellCheck={!q.code}
              rows={q.code ? 6 : 4}
              maxLength={20000}
              aria-label={`Your answer to question ${i + 1}`}
              placeholder={q.code ? "Write your code here" : "Type your answer here"}
              className={`w-full rounded-md border bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                q.code ? "font-mono text-[13px] whitespace-pre" : ""
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}

// `preview` is the teacher's "see exactly what students see": the same page, but
// nothing is saved or turned in - no draft in localStorage, files stay in the
// browser (they can still try images to see the sketch run), and Turn in is off.
export default function SketchWorkspace({ project, submission, draftKey, onSubmitted, onBack, preview = false }) {
  const parts = useMemo(() => project.parts || [], [project.parts]);
  const multi = parts.length > 0;
  const programIds = useMemo(() => (multi ? parts.map((p) => p.id) : [SINGLE]), [multi, parts]);

  const questions = useMemo(() => project.questions || [], [project.questions]);
  const hasWritten = questions.length > 0;
  // Written questions come first, when there are any.
  const [programs, setPrograms] = useState(() => initialPrograms(draftKey, submission, project, programIds, multi));
  const [answers, setAnswers] = useState(() => initialAnswers(draftKey, submission, questions));
  const [activePart, setActivePart] = useState(hasWritten ? WRITTEN : programIds[0]);
  const [activeTabs, setActiveTabs] = useState({}); // programId -> open tab index
  const [view, setView] = useState("code"); // code | assignment
  const [split, setSplit] = useState(46);
  const [briefOpen, setBriefOpen] = useState(true);

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
  const [confirmReset, setConfirmReset] = useState(false);

  const editorViewRef = useRef(null);
  const runnerRef = useRef(null);
  const pickerRef = useRef(null);
  // Same size preference (and control) the Java editor uses - one setting for all of their code.
  const { fontSize, increase, decrease, reset: resetFont, canIncrease, canDecrease } = useCodeFontSize();
  // Built once. A new extensions array makes @uiw/react-codemirror tear the editor down
  // and drop the cursor mid-edit (see CodePracticePage), so Run reaches in through a ref.
  const runHandler = useRef(() => {});
  const editorExtensions = useMemo(
    () => [
      // Processing's syntax is Java's, so the Java mode colours it correctly.
      java(),
      ...a11yDarkEditorTheme,
      // Tab indents (rather than moving focus off the editor); Ctrl/Cmd+Enter runs
      // instead of inserting a blank line.
      keymap.of([indentWithTab]),
      Prec.highest(keymap.of([{ key: "Mod-Enter", run: () => { runHandler.current(); return true; } }])),
    ],
    []
  );

  const onWritten = hasWritten && activePart === WRITTEN;
  const tabs = programs[activePart] || blankProgram();
  const active = Math.min(activeTabs[activePart] || 0, tabs.length - 1);
  const current = tabs[active];
  const setActive = (i) => setActiveTabs((a) => ({ ...a, [activePart]: i }));
  // The instructions + screenshots to show beside the code: the open program's,
  // or - for a single-program assignment - the assignment's own.
  const activeMeta = multi ? parts.find((p) => p.id === activePart) : project.brief || null;

  // ---- draft: every edit is kept locally, so a refresh or a closed tab never loses a paste ----
  useEffect(() => {
    if (preview) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ programs, answers, savedAt: Date.now() }));
    } catch {
      // private window / storage full - the page still works, it just can't remember
    }
  }, [programs, answers, draftKey, preview]);

  // What the runner is handed: just the open program's tabs.
  const runFiles = useMemo(() => tabs.map((t) => ({ filename: `${t.name}.pde`, content: t.code })), [tabs]);
  const anyCode = programIds.some((id) => hasCode(programs[id]));
  // A bonus program is not asked for, so it never counts against "started" or "nothing written".
  const requiredParts = multi ? parts.filter((p) => !p.optional) : [];
  const filledCount = multi ? requiredParts.filter((p) => hasCode(programs[p.id])).length : programIds.filter((id) => hasCode(programs[id])).length;
  const turnedInAnswers = useMemo(() => cleanAnswers(answers, questions), [answers, questions]);
  const answeredCount = Object.keys(turnedInAnswers).length;
  // Something to turn in: code, or - when there are questions - an answer.
  const anyWork = anyCode || answeredCount > 0;
  const submitted = !!submission?.submitted;
  const changedSinceSubmit = useMemo(() => {
    if (!submitted) return false;
    const stored = toSubmission(programsFromFiles(submission.files, programIds, multi), programIds, multi);
    const codeChanged = JSON.stringify(stored) !== JSON.stringify(toSubmission(programs, programIds, multi));
    const answersChanged = JSON.stringify(cleanAnswers(submission.answers, questions)) !== JSON.stringify(turnedInAnswers);
    return codeChanged || answersChanged;
  }, [submitted, submission?.files, submission?.answers, programs, programIds, multi, questions, turnedInAnswers]);

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
    if (!submission?.id && !preview) return;
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
      if (preview) {
        // Kept in this browser tab only, so the teacher can try a sketch with an image.
        const asset = await assetFromBlob(file.name, file, { id: `local-${file.name}` });
        setAssets((prev) =>
          [...prev.filter((a) => a.name.toLowerCase() !== lower), asset].sort((a, b) => a.name.localeCompare(b.name))
        );
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
    if (preview) { setAssets((prev) => prev.filter((a) => a.id !== asset.id)); return; }
    try {
      await base44.entities.SketchAsset.remove(submission.id, asset.id);
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    } catch (e) {
      setAssetError(e.message || `Couldn't remove ${asset.name}.`);
    }
  };

  // ---- editing (always the open program) ----
  const setTabs = (fn) => setPrograms((prev) => ({ ...prev, [activePart]: fn(prev[activePart] || blankProgram()) }));
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
    setActive(Math.max(0, Math.min(active, tabs.length - 2)));
  };

  const finishRename = (i, raw) => {
    const name = safeTabName(raw);
    setRenaming(null);
    if (tabs.some((t, j) => j !== i && t.name.toLowerCase() === name.toLowerCase())) return;
    setTabs((prev) => prev.map((t, j) => (j === i ? { ...t, name } : t)));
  };

  const doRun = useCallback(() => {
    setReport(null);
    runnerRef.current?.run();
  }, []);

  runHandler.current = doRun;

  useEffect(() => {
    const onKey = (e) => {
      // The editor handles its own Ctrl/Cmd+Enter (and marks it handled), so this is
      // only for when focus is somewhere else on the page.
      if (e.defaultPrevented) return;
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
  const emptyPrograms = requiredParts.filter((p) => !hasCode(programs[p.id]));
  const unanswered = questions.filter((q) => !turnedInAnswers[q.id]);
  // Code Processing itself would refuse to run. Only worked out while the dialog is
  // open (it tokenizes everything), and only a warning: they can still turn it in.
  const syntaxProblems = useMemo(() => {
    if (!submitOpen) return [];
    const out = [];
    for (const id of programIds) {
      const list = programs[id] || [];
      if (!hasCode(list)) continue;
      const title = multi ? parts.find((p) => p.id === id)?.title : null;
      for (const t of list) {
        const where = [title, `${t.name}.pde`].filter(Boolean).join(" / ");
        // Brackets first, as the run does: until they pair up, the semicolon check means little.
        const unpaired = findBracketProblems(t.code);
        const found = unpaired.length > 0
          ? unpaired.map((m) => ({ ...m, what: m.message }))
          : findMissingSemicolons(t.code).map((m) => ({ ...m, what: "needs a semicolon" }));
        for (const m of found) out.push({ where, ...m });
      }
    }
    return out;
  }, [submitOpen, programs, programIds, multi, parts]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const sub = await base44.entities.Submission.submitSketch(
        project.id,
        toSubmission(programs, programIds, multi),
        aiHelpUsed,
        aiHelpLink.trim() || null,
        turnedInAnswers
      );
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

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {preview && (
        <div className="bg-amber-100 text-amber-900 text-xs px-4 py-1.5 flex items-center gap-2">
          <Eye className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            <strong>Preview.</strong> This is exactly what a student sees. Nothing you do here is saved or turned in.
          </span>
        </div>
      )}
      <header className="flex items-center gap-3 px-4 py-2 bg-white border-b flex-wrap">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {preview ? "Close preview" : "My Work"}
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
            <span className="text-xs text-muted-foreground">{preview ? "Preview - nothing is saved" : "Not turned in yet"}</span>
          )}
          <Button
            onClick={() => { setSubmitError(""); setSubmitOpen(true); }}
            disabled={!anyWork || preview}
            title={preview ? "Turning in is switched off in the preview" : undefined}
          >
            <Send className="w-4 h-4 mr-1.5" />
            {submitted ? "Turn in again" : "Turn in"}
          </Button>
        </div>
      </header>

      <div id="sketch-split" className="flex-1 min-h-0 flex">
        {/* ---------------- left: code / assignment ---------------- */}
        <div className="flex flex-col min-w-0 bg-white" style={{ width: onWritten && view === "code" ? "100%" : `${split}%` }}>
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
            {multi && (
              <span className="ml-3 text-xs text-muted-foreground pb-1.5">
                {filledCount} of {requiredParts.length} programs started
              </span>
            )}
            {!(onWritten && view === "code") && (
              <span className="ml-auto text-[11px] text-muted-foreground pb-1.5">Run: Ctrl/Cmd + Enter</span>
            )}
          </div>

          {view === "assignment" ? (
            <div className="flex-1 overflow-auto p-5 space-y-5">
              {project.description_html && (
                <div
                  className="prose prose-sm max-w-none quill-render"
                  dangerouslySetInnerHTML={{ __html: openLinksInNewTab(project.description_html) }}
                />
              )}
              {!multi && (project.brief?.description || (project.brief?.images || []).length > 0) && (
                <div className="space-y-2">
                  {project.brief.description && (
                    <div className="text-sm markdown-render"><ReactMarkdown>{project.brief.description}</ReactMarkdown></div>
                  )}
                  <PartImages urls={project.brief.images} />
                </div>
              )}
              {multi && (
                <div className="space-y-2">
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Programs to turn in ({parts.length})
                  </h2>
                  <ol className="space-y-2">
                    {parts.map((p, i) => (
                      <li key={p.id} className="border rounded-lg p-3">
                        <button
                          onClick={() => { setActivePart(p.id); setView("code"); }}
                          className="font-medium text-sm hover:text-primary text-left"
                        >
                          {i + 1}. {p.title}
                        </button>
                        {typeof p.points === "number" && (
                          <span className="ml-2 text-xs text-muted-foreground">{p.points} pt{p.points === 1 ? "" : "s"}</span>
                        )}
                        {p.description && <div className="text-sm text-muted-foreground mt-1 markdown-render"><ReactMarkdown>{p.description}</ReactMarkdown></div>}
                        <PartImages urls={p.images} />
                      </li>
                    ))}
                  </ol>
                </div>
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
                  <p className="text-xs text-muted-foreground mt-1.5">
                    If this shows an error, use <strong>Open in new tab</strong> above, and let your teacher know - the
                    document may not be shared with you yet.
                  </p>
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
              {!project.description_html && !project.google_doc_url && !project.rubric_md && !multi && (
                <p className="text-sm text-muted-foreground">Your teacher didn't add directions for this one.</p>
              )}
            </div>
          ) : (
            <>
              {/* ---- the programs of a problem set ---- */}
              {(multi || hasWritten) && (
                <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-slate-50 overflow-x-auto">
                  {hasWritten && (
                    <button
                      onClick={() => setActivePart(WRITTEN)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-md whitespace-nowrap border transition-colors ${
                        onWritten
                          ? "bg-white border-primary/50 font-medium shadow-sm"
                          : "border-transparent text-muted-foreground hover:bg-white hover:text-foreground"
                      }`}
                      title={`${answeredCount} of ${questions.length} questions answered`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${answeredCount === questions.length ? "bg-emerald-500" : answeredCount > 0 ? "bg-amber-400" : "bg-slate-300"}`} />
                      Written ({answeredCount}/{questions.length})
                    </button>
                  )}
                  {!multi && hasWritten && (
                    <button
                      onClick={() => setActivePart(SINGLE)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-md whitespace-nowrap border transition-colors ${
                        !onWritten
                          ? "bg-white border-primary/50 font-medium shadow-sm"
                          : "border-transparent text-muted-foreground hover:bg-white hover:text-foreground"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${hasCode(programs[SINGLE]) ? "bg-emerald-500" : "bg-slate-300"}`} />
                      Program
                    </button>
                  )}
                  {multi && parts.map((p, i) => {
                    const filled = hasCode(programs[p.id]);
                    return (
                      <button
                        key={p.id}
                        onClick={() => setActivePart(p.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-md whitespace-nowrap border transition-colors ${
                          p.id === activePart
                            ? "bg-white border-primary/50 font-medium shadow-sm"
                            : "border-transparent text-muted-foreground hover:bg-white hover:text-foreground"
                        }`}
                        title={filled ? "Has code" : "Nothing here yet"}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${filled ? "bg-emerald-500" : "bg-slate-300"}`} />
                        {i + 1}. {p.title}{p.optional && <span className="text-[10px] uppercase tracking-wide text-violet-600">bonus</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {onWritten ? (
                <WrittenQuestions
                  questions={questions}
                  answers={answers}
                  onChange={(id, text) => setAnswers((a) => ({ ...a, [id]: text }))}
                />
              ) : (
              <>
              {(activeMeta?.description || (activeMeta?.images || []).length > 0) && (
                <ProgramBrief meta={activeMeta} open={briefOpen} onToggle={() => setBriefOpen((o) => !o)} />
              )}

              <div className="flex items-end gap-0.5 px-2 pt-1.5 bg-slate-50 border-b overflow-x-auto">
                {tabs.map((t, i) => (
                  <div
                    key={i}
                    onClick={() => setActive(i)}
                    onDoubleClick={() => setRenaming(i)}
                    className={`group flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-t-md border border-b-0 cursor-pointer whitespace-nowrap ${
                      i === active ? "bg-white font-medium" : "bg-slate-100 text-muted-foreground hover:text-foreground"
                    }`}
                    title={i === 0 ? "This program's main tab. Double-click to rename." : "Double-click to rename"}
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
                <div className="ml-auto self-center mr-1 flex items-center gap-2">
                  <button
                    onClick={() => { if (editorViewRef.current) { autoIndentView(editorViewRef.current); editorViewRef.current.focus(); } }}
                    className="text-xs px-2 py-1 rounded text-muted-foreground hover:text-foreground"
                    title="Fix the indentation of this tab"
                  >
                    Auto-indent
                  </button>
                  <CodeFontSizeControl
                    fontSize={fontSize}
                    onIncrease={increase}
                    onDecrease={decrease}
                    onReset={resetFont}
                    canIncrease={canIncrease}
                    canDecrease={canDecrease}
                  />
                {activeMeta?.starter?.trim() && (
                  <button
                    onClick={() => {
                      // Two clicks: this replaces everything they have written for the program.
                      if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 4000); return; }
                      setPrograms((prev) => ({ ...prev, [activePart]: starterTabs(activeMeta) }));
                      setActive(0);
                      setConfirmReset(false);
                    }}
                    className={`text-xs px-2 py-1 rounded ${
                      confirmReset ? "bg-amber-100 text-amber-900" : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Put this program back to the starter code your teacher gave"
                  >
                    {confirmReset ? "Click again to replace your code" : "Reset to starter code"}
                  </button>
                )}
                </div>
              </div>

              {/* The font size rides in as a CSS variable the theme reads - changing a
                  variable only restyles, where a new extension would rebuild the editor. */}
              <div className="flex-1 min-h-[120px] overflow-hidden" style={{ "--code-editor-font-size": `${fontSize}px` }}>
                <CodeMirror
                  key={`${activePart}:${active}`}
                  value={current?.code || ""}
                  onChange={setCode}
                  theme="none"
                  extensions={editorExtensions}
                  height="100%"
                  style={{ height: "100%" }}
                  basicSetup={{ tabSize: 2 }}
                  onCreateEditor={(view) => { editorViewRef.current = view; }}
                  placeholder={multi ? `Paste program ${parts.findIndex((p) => p.id === activePart) + 1} here, then press Run.` : "Paste your Processing code here, then press Run."}
                />
              </div>

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
                    {multi && " - shared by every program"}
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

                {submission?.assets_purged_at && assets.length === 0 && (
                  <p className="text-xs text-blue-900 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5">
                    Your images were deleted on {new Date(submission.assets_purged_at).toLocaleDateString()}, a week after this
                    was graded, to save space. If you turn it in again, add them back first.
                  </p>
                )}

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
            </>
          )}
        </div>

        {!(onWritten && view === "code") && (
          <ResizableDivider containerId="sketch-split" leftPercent={split} onResize={setSplit} />
        )}

        {/* ---------------- right: the running sketch ---------------- */}
        <div className={`flex-1 min-w-0 min-h-0 flex flex-col ${onWritten && view === "code" ? "hidden" : ""}`}>
          <SketchRunner
            ref={runnerRef}
            className="h-full"
            files={runFiles}
            assets={assets}
            // Switching program stops the one that was running.
            resetKey={`${project.id}:${activePart}`}
            onReport={setReport}
          />
        </div>
      </div>

      <Dialog open={submitOpen} onOpenChange={(o) => !submitting && setSubmitOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{submitted ? "Turn in again?" : "Turn in your work"}</DialogTitle>
            <DialogDescription>
              {hasWritten && `${answeredCount} of ${questions.length} written answers, `}
              {multi
                ? `${programIds.filter((id) => hasCode(programs[id])).length} of ${parts.length} programs`
                : anyCode
                ? `${programs[SINGLE].length} tab${programs[SINGLE].length === 1 ? "" : "s"} of code`
                : "no code yet"}{" "}
              and {assets.length} file{assets.length === 1 ? "" : "s"}.
              {submitted && " This replaces what you turned in before."}
            </DialogDescription>
          </DialogHeader>

          {unanswered.length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Not answered yet: {unanswered.map((q) => `question ${questions.indexOf(q) + 1}`).join(", ")}. You can turn in
              now and answer {unanswered.length === 1 ? "it" : "them"} later by turning in again.
            </p>
          )}

          {emptyPrograms.length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Nothing written yet for: {emptyPrograms.map((p) => p.title).join(", ")}. You can turn in now and add
              {emptyPrograms.length === 1 ? " it" : " them"} later by turning in again.
            </p>
          )}

          {syntaxProblems.length > 0 && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
              <p>
                Heads up: Processing won&rsquo;t run this as written - {syntaxProblems.length === 1 ? "there's a mistake" : `there are ${syntaxProblems.length} mistakes`} it would stop at:
              </p>
              <ul className="font-mono text-xs space-y-0.5">
                {syntaxProblems.slice(0, 4).map((m, i) => (
                  <li key={i}>{m.where}, line {m.line} {m.what}: {m.text.slice(0, 40)}</li>
                ))}
                {syntaxProblems.length > 4 && <li>...and {syntaxProblems.length - 4} more</li>}
              </ul>
              <p className="text-xs">You can fix it and turn in again, or turn it in as it is.</p>
            </div>
          )}

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

          {/* Only visible when the feedback was released - the server withholds the score otherwise. */}
          {submitted && submission?.feedback_released && (
            <p className="text-sm text-blue-900 bg-blue-50 border border-blue-200 rounded-lg p-3">
              Your teacher has already graded this. If you turn it in again, it goes back to waiting for a grade:
              your current grade and feedback are kept, but you won&rsquo;t see them until your teacher looks at the
              new version.
            </p>
          )}

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setSubmitOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting || !aiHelpAnswered || !anyWork}>
              {submitting ? "Turning in..." : submitted ? "Turn in again" : "Turn in"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
