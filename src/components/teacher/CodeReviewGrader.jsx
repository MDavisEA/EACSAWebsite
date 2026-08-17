import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import CommentBank from "./CommentBank";
import InteractiveRunner from "@/components/InteractiveRunner";
import {
  Loader2, Save, CheckCircle2, ChevronLeft, ChevronRight, MessageSquare, Trash2, User,
  FileCode, Terminal, Info,
} from "lucide-react";

// Reading the code and running the code are two different jobs, and doing both
// at once meant each got half the window. They are tabs instead, with a
// shortcut, because grading a pile means flipping between them constantly.
// Cmd/Ctrl+Shift+F rather than anything with Alt: Alt+letter types a special
// character on a Mac, and the obvious browser combos are taken (Cmd+Shift+T
// reopens a closed tab, Cmd+1/2 switch browser tabs).
const TOGGLE_HINT = "⌘⇧F";

// Grading a hand-marked coding problem, built around the thing that actually
// costs time: reading code, finding out whether it works, and saying something
// useful about it. All three happen in this one window - the code, a Run
// button wired to the real runner, and comments you can pin to a line - so
// there is no copying code into an IDE and back.
export default function CodeReviewGrader({ problem, onGraded }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);

  const [score, setScore] = useState("");
  const [comments, setComments] = useState("");
  const [lineComments, setLineComments] = useState([]);
  const [activeLine, setActiveLine] = useState(null);
  const [draftLine, setDraftLine] = useState("");

  const [tab, setTab] = useState("feedback");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, [problem.id]);

  // Note this cannot fire while the cursor is inside the runner: browsers do
  // not deliver keystrokes from a cross-origin frame to the page around it. The
  // tab buttons stay clickable for exactly that case.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (e.key.toLowerCase() !== "f") return;
      e.preventDefault();
      setTab((t) => (t === "feedback" ? "testing" : "feedback"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await base44.entities.Submission.filter(
        { coding_problem_id: problem.id, submitted: true },
        "-submitted_at"
      );
      setSubmissions(rows);
      if (rows.length > 0) hydrate(rows[0]);
    } finally {
      setLoading(false);
    }
  };

  const hydrate = (s) => {
    setScore(s.score != null ? String(s.score) : "");
    setComments(s.teacher_comments || "");
    setLineComments(s.line_comments || []);
    setActiveLine(null);
    setDraftLine("");
    setSaved(false);
    setError("");
  };

  const go = (delta) => {
    const next = index + delta;
    if (next < 0 || next >= submissions.length) return;
    setIndex(next);
    hydrate(submissions[next]);
  };

  const current = submissions[index];

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const parsed = score.trim() === "" ? null : Number(score);
      await base44.entities.Submission.update(current.id, {
        score: Number.isFinite(parsed) ? parsed : null,
        teacher_comments: comments,
        line_comments: lineComments,
      });
      setSubmissions((prev) =>
        prev.map((s, i) =>
          i === index
            ? { ...s, score: parsed, teacher_comments: comments, line_comments: lineComments }
            : s
        )
      );
      setSaved(true);
      onGraded?.();
    } catch (e) {
      setError(e.message || "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  const addLineComment = () => {
    const body = draftLine.trim();
    if (!body || activeLine == null) return;
    setLineComments((prev) => [...prev.filter((c) => c.line !== activeLine), { line: activeLine, body }]);
    setDraftLine("");
    setActiveLine(null);
    setSaved(false);
  };

  const removeLineComment = (line) => {
    setLineComments((prev) => prev.filter((c) => c.line !== line));
    setSaved(false);
  };

  if (loading) return <p className="text-sm text-muted-foreground py-6">Loading submissions...</p>;

  if (submissions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Nobody has turned this in yet.
      </p>
    );
  }

  const lines = (current.code || "").split("\n");
  const commentFor = (n) => lineComments.find((c) => c.line === n);
  const maxPoints = problem.manual_points ?? problem.points_possible ?? null;

  return (
    <div className="space-y-4 py-2">
      {/* Who, and a way through the pile without going back to the list. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="font-medium truncate">{current.student_name}</span>
          {current.score != null && <Badge variant="outline">Graded</Badge>}
          {current.submitted_at && (
            <span className="text-xs text-muted-foreground">
              {format(new Date(current.submitted_at), "MMM d, h:mm a")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">
            {index + 1} of {submissions.length}
          </span>
          <Button variant="outline" size="sm" onClick={() => go(-1)} disabled={index === 0}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => go(1)}
            disabled={index === submissions.length - 1}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Reading vs running. */}
      <div className="flex items-center gap-1 border rounded-lg p-1 w-fit bg-slate-50">
        {[
          { id: "feedback", label: "Feedback", Icon: FileCode },
          { id: "testing", label: "Testing", Icon: Terminal },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors ${
              tab === id
                ? "bg-white shadow-sm font-medium text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
        <span className="text-xs text-muted-foreground px-2 select-none">{TOGGLE_HINT}</span>
      </div>

      {tab === "testing" ? (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-slate-100 px-3 py-1.5 border-b flex items-center gap-2">
            <span className="text-xs font-medium">Running {current.student_name}&rsquo;s program</span>
            <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Already loaded. Press Run, then type answers straight into the console.
            </span>
          </div>
          <InteractiveRunner
            code={current.code || ""}
            fileName={`${problem.class_name || "Main"}.java`}
            resetKey={current.id}
            height={560}
          />
          <div className="bg-slate-50 border-t px-3 py-1.5 text-xs text-muted-foreground">
            A scratch copy — editing here changes nothing about what they turned in, so poke at it
            freely. Their saved submission is what you see on the Feedback tab.
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
        {/* The code, with a clickable gutter. Clicking a line number is how a
            comment gets pinned to it. */}
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-slate-100 px-3 py-1.5 text-xs text-muted-foreground border-b">
            Click any line to comment on it
          </div>
          <div className="bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto max-h-[420px] overflow-y-auto">
            {lines.map((text, i) => {
              const n = i + 1;
              const c = commentFor(n);
              return (
                <div key={n}>
                  {/* The whole line is the target, not just the number in the
                      gutter - reaching for the code you are commenting on is the
                      instinct, and a 40px-wide gutter is a small thing to hit
                      repeatedly across a class set. */}
                  <div
                    onClick={() => { setActiveLine(n); setDraftLine(c?.body || ""); }}
                    className={`flex cursor-pointer group hover:bg-slate-800 ${
                      c ? "bg-amber-500/10" : ""
                    }`}
                    title={c ? "Edit this comment" : "Comment on this line"}
                  >
                    <span
                      className={`w-10 flex-shrink-0 text-right pr-2 select-none border-r border-slate-700 ${
                        c ? "text-amber-400 font-semibold" : "text-slate-500 group-hover:text-slate-300"
                      }`}
                    >
                      {n}
                    </span>
                    <pre className="px-2 whitespace-pre flex-1">{text || " "}</pre>
                    {!c && activeLine !== n && (
                      <MessageSquare
                        className="w-3 h-3 mr-2 self-center flex-shrink-0 text-slate-500 opacity-0 group-hover:opacity-100"
                      />
                    )}
                  </div>

                  {c && (
                    <div className="flex items-start gap-1.5 bg-amber-500/15 border-l-2 border-amber-400 pl-11 pr-2 py-1">
                      <MessageSquare className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                      <span className="text-amber-100 flex-1">{c.body}</span>
                      <button
                        onClick={() => removeLineComment(n)}
                        className="text-slate-400 hover:text-red-400"
                        title="Remove this line comment"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {activeLine === n && (
                    <div className="bg-slate-800 pl-11 pr-2 py-2 space-y-1.5">
                      <Textarea
                        value={draftLine}
                        onChange={(e) => setDraftLine(e.target.value)}
                        placeholder={`Comment on line ${n}...`}
                        rows={2}
                        className="text-xs bg-slate-900 border-slate-700 text-slate-100"
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" className="h-7 text-xs" onClick={addLineComment}>
                          Add
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-slate-400"
                          onClick={() => { setActiveLine(null); setDraftLine(""); }}
                        >
                          Cancel
                        </Button>
                      </div>
                      <div className="[&_button]:text-slate-300">
                        <CommentBank compact value={draftLine} onChange={setDraftLine} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Score it and say something about it. */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">
              Score{maxPoints != null ? ` (out of ${maxPoints})` : ""}
            </Label>
            <Input
              type="number"
              value={score}
              onChange={(e) => { setScore(e.target.value); setSaved(false); }}
              className="max-w-[120px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Overall comments</Label>
            <Textarea
              value={comments}
              onChange={(e) => { setComments(e.target.value); setSaved(false); }}
              placeholder="Feedback on the whole submission..."
              rows={4}
              className="text-sm"
            />
            <CommentBank compact value={comments} onChange={(v) => { setComments(v); setSaved(false); }} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...</>
            ) : saved ? (
              <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Saved</>
            ) : (
              <><Save className="w-4 h-4 mr-1.5" /> Save grade</>
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            {lineComments.length > 0
              ? `${lineComments.length} line comment${lineComments.length === 1 ? "" : "s"} will be saved with this.`
              : "Line comments you add are saved with the grade."}
          </p>
        </div>
      </div>
      )}
    </div>
  );
}
