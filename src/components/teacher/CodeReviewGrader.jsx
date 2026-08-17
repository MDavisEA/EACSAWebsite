import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CommentBank from "./CommentBank";
import InteractiveRunner from "@/components/InteractiveRunner";
import { highlightJava, ONE_DARK } from "@/lib/javaHighlight";
import {
  Loader2, Save, CheckCircle2, ChevronLeft, ChevronRight, MessageSquare, Trash2, User,
  FileCode, Terminal, Info, ChevronRight as Arrow,
} from "lucide-react";

// Grading a hand-marked coding problem. Two levels on purpose: the card shows
// WHO turned in, and grading one person happens in a window of its own. Reading
// code in a panel squeezed inside a dashboard card was the actual complaint -
// there is never enough width for code, and everything else got crowded out.
//
// Inside the window, reading the code and running it are tabs rather than a
// split, since each wants the whole width. Cmd/Ctrl+Shift+F flips between them:
// Alt+letter types a special character on a Mac, and the obvious browser combos
// are taken (Cmd+Shift+T reopens a closed tab, Cmd+1/2 switch browser tabs).
const TOGGLE_HINT = "⌘⇧F";

export default function CodeReviewGrader({ problem, onGraded }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0); // which student
  const [attemptIndex, setAttemptIndex] = useState(0); // 0 = their most recent
  const [tab, setTab] = useState("feedback");

  const [score, setScore] = useState("");
  const [comments, setComments] = useState("");
  const [lineComments, setLineComments] = useState([]);
  const [activeLine, setActiveLine] = useState(null);
  const [draftLine, setDraftLine] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, [problem.id]);

  // Only while the window is open, and note it cannot fire while the cursor is
  // inside the runner: browsers do not deliver keystrokes from a cross-origin
  // frame to the page around it. The tab buttons stay clickable for that case.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (e.key.toLowerCase() !== "f") return;
      e.preventDefault();
      setTab((t) => (t === "feedback" ? "testing" : "feedback"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await base44.entities.Submission.filter(
        { coding_problem_id: problem.id, submitted: true },
        "-submitted_at"
      );
      setSubmissions(rows);
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

  // One row per STUDENT, not per row in the table. A student can end up with
  // several submissions - reopening a finished problem inserts a fresh row
  // rather than reusing the old one - and a list of repeated names is worse
  // than useless when you are working out who still needs marking. Keyed on
  // the signed-in user where there is one, falling back to email and then name
  // for rows created before sign-in was required.
  const groups = useMemo(() => {
    const byStudent = new Map();
    for (const s of submissions) {
      const key =
        s.student_user_id || (s.student_email || "").toLowerCase() || s.student_name || s.id;
      if (!byStudent.has(key)) byStudent.set(key, []);
      byStudent.get(key).push(s);
    }
    return [...byStudent.values()]
      .map((all) => {
        // Newest first, so [0] is the attempt that counts.
        const sorted = [...all].sort(
          (a, b) => new Date(b.submitted_at ?? 0) - new Date(a.submitted_at ?? 0)
        );
        return { name: sorted[0].student_name, latest: sorted[0], all: sorted };
      })
      // Alphabetical: this is a class list being worked through, so finding a
      // particular person matters more than who happened to submit last.
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [submissions]);

  const openAt = (i) => {
    setIndex(i);
    setAttemptIndex(0);
    hydrate(groups[i].all[0]);
    setTab("feedback");
    setOpen(true);
  };

  const go = (delta) => {
    const next = index + delta;
    if (next < 0 || next >= groups.length) return;
    setIndex(next);
    setAttemptIndex(0);
    hydrate(groups[next].all[0]);
    setTab("feedback");
  };

  const pickAttempt = (j) => {
    setAttemptIndex(j);
    hydrate(groups[index].all[j]);
    setTab("feedback");
  };

  const group = groups[index];
  const current = group?.all[attemptIndex];
  const viewingOlder = attemptIndex > 0;

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
      // Matched on id, not position: the list is grouped by student now, so an
      // index into `groups` is not an index into `submissions`.
      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === current.id
            ? { ...s, score: parsed, teacher_comments: comments, line_comments: lineComments }
            : s
        )
      );
      setSaved(true);
      onGraded?.();
      return true;
    } catch (e) {
      setError(e.message || "Couldn't save that.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // The point of the pile is getting through it, so saving and moving on is one
  // action. It never advances past a failed save - that would silently drop the
  // grade just typed.
  const saveAndNext = async () => {
    const ok = await save();
    if (!ok) return;
    if (index < groups.length - 1) go(1);
    else setOpen(false);
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

  const gradedCount = groups.filter((g) => g.latest.score != null).length;
  const maxPoints = problem.manual_points ?? problem.points_possible ?? null;

  const lines = (current?.code || "").split("\n");
  const highlighted = highlightJava(current?.code || "");
  const commentFor = (n) => lineComments.find((c) => c.line === n);
  const hasCode = !!(current?.code || "").trim();

  return (
    <div className="py-2">
      {/* Who turned in. Grading happens in the window, not in here. */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground">
          {groups.length} turned in &middot; {gradedCount} graded
          {gradedCount < groups.length && `, ${groups.length - gradedCount} to go`}
        </p>
      </div>

      <div className="border rounded-lg divide-y overflow-hidden">
        {groups.map((g, i) => {
          const s = g.latest;
          const late = problem.due_date && s.submitted_at && new Date(s.submitted_at) > new Date(problem.due_date);
          const noCode = !(s.code || "").trim();
          const attempts = g.all.length;
          return (
            <button
              key={g.name + i}
              onClick={() => openAt(i)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
            >
              <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="font-medium truncate">{g.name}</span>

              {s.submitted_at && (
                <span className="text-xs text-muted-foreground">
                  {format(new Date(s.submitted_at), "MMM d, h:mm a")}
                </span>
              )}
              {late && <Badge variant="outline" className="text-amber-700 border-amber-300">Late</Badge>}
              {noCode && (
                <Badge variant="outline" className="text-slate-500">No code</Badge>
              )}
              {attempts > 1 && (
                <Badge variant="outline" className="text-slate-500">
                  {attempts} attempts
                </Badge>
              )}

              <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                {(s.line_comments || []).length > 0 && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {(s.line_comments || []).length}
                  </span>
                )}
                {s.score != null ? (
                  <Badge variant="outline" className="text-emerald-700 border-emerald-300">
                    {s.score}{maxPoints != null ? ` / ${maxPoints}` : ""}
                  </Badge>
                ) : (
                  <Badge>Needs grading</Badge>
                )}
                <Arrow className="w-4 h-4 text-slate-400" />
              </span>
            </button>
          );
        })}
      </div>

      {/* One student, all the room. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[93vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span>{current?.student_name}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {problem.title}
              </span>
              {current?.submitted_at && (
                <span className="text-xs font-normal text-muted-foreground">
                  turned in {format(new Date(current.submitted_at), "MMM d, h:mm a")}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {current && (
            <>
              {/* Move through the pile, score, save - all reachable from here. */}
              <div className="flex items-center gap-3 flex-wrap border-b pb-3">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => go(-1)} disabled={index === 0}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground px-1">
                    {index + 1} of {groups.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => go(1)}
                    disabled={index === groups.length - 1}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-xs text-slate-500 whitespace-nowrap">
                    Score{maxPoints != null ? ` / ${maxPoints}` : ""}
                  </Label>
                  <Input
                    type="number"
                    value={score}
                    onChange={(e) => { setScore(e.target.value); setSaved(false); }}
                    className="w-20 text-center"
                  />
                </div>

                <div className="flex items-center gap-1 border rounded-lg p-1 bg-slate-50 ml-auto">
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

                <Button variant="outline" onClick={save} disabled={saving}>
                  {saving ? (
                    <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...</>
                  ) : saved ? (
                    <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Saved</>
                  ) : (
                    <><Save className="w-4 h-4 mr-1.5" /> Save</>
                  )}
                </Button>
                <Button onClick={saveAndNext} disabled={saving}>
                  {index < groups.length - 1 ? "Save & next" : "Save & close"}
                </Button>
              </div>

              {/* Only when they turned it in more than once. Their most recent
                  attempt opens by default, which is the one that counts. */}
              {group.all.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-muted-foreground">Attempts:</span>
                  {group.all.map((s, j) => (
                    <button
                      key={s.id}
                      onClick={() => pickAttempt(j)}
                      className={`rounded-full border px-2.5 py-1 transition-colors ${
                        j === attemptIndex
                          ? "bg-slate-900 text-white border-slate-900"
                          : "hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      {j === 0 ? "Most recent" : `#${group.all.length - j}`}
                      {s.submitted_at && ` · ${format(new Date(s.submitted_at), "MMM d, h:mm a")}`}
                      {s.score != null && ` · ${s.score}`}
                    </button>
                  ))}
                </div>
              )}

              {viewingOlder && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                  This is an earlier attempt. A grade saved here is not the one the student sees —
                  their dashboard shows the grade on their most recent attempt.
                </p>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              {tab === "testing" ? (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-slate-100 px-3 py-1.5 border-b flex items-center gap-2">
                    <span className="text-xs font-medium">
                      Running {current.student_name}&rsquo;s program
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5" />
                      Already loaded. Press Run, then type answers straight into the console.
                    </span>
                  </div>
                  {hasCode ? (
                    <InteractiveRunner
                      code={current.code}
                      fileName={`${problem.class_name || "Main"}.java`}
                      resetKey={current.id}
                      height={560}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground p-6 text-center">
                      There is no code to run — they turned this in empty.
                    </p>
                  )}
                  <div className="bg-slate-50 border-t px-3 py-1.5 text-xs text-muted-foreground">
                    A scratch copy — editing here changes nothing about what they turned in, so poke
                    at it freely. Their saved submission is what you see on the Feedback tab.
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 items-start">
                  {/* The code, with a clickable gutter. */}
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-slate-100 px-3 py-1.5 text-xs text-muted-foreground border-b">
                      {hasCode ? "Click any line to comment on it" : "Nothing was turned in"}
                    </div>
                    {hasCode ? (
                      <div
                        className="text-xs font-mono overflow-x-auto max-h-[60vh] overflow-y-auto"
                        style={{ background: ONE_DARK.bg, color: ONE_DARK.plain }}
                      >
                        {lines.map((text, i) => {
                          const n = i + 1;
                          const c = commentFor(n);
                          return (
                            <div key={n}>
                              {/* The whole line is the target, not just the number
                                  in the gutter - reaching for the code you are
                                  commenting on is the instinct, and a 40px gutter
                                  is a small thing to hit over and over. */}
                              <div
                                onClick={() => { setActiveLine(n); setDraftLine(c?.body || ""); }}
                                className={`flex cursor-pointer group hover:bg-slate-800 ${
                                  c ? "bg-amber-500/10" : ""
                                }`}
                                title={c ? "Edit this comment" : "Comment on this line"}
                              >
                                <span
                                  className={`w-10 flex-shrink-0 text-right pr-2 select-none border-r border-slate-700 ${
                                    c
                                      ? "text-amber-400 font-semibold"
                                      : "text-slate-500 group-hover:text-slate-300"
                                  }`}
                                >
                                  {n}
                                </span>
                                <pre className="px-2 whitespace-pre flex-1">
                                  {(highlighted[i] || []).length === 0
                                    ? text || " "
                                    : highlighted[i].map((t, ti) => (
                                        <span
                                          key={ti}
                                          style={{
                                            color: t.color,
                                            fontStyle: t.italic ? "italic" : undefined,
                                          }}
                                        >
                                          {t.text}
                                        </span>
                                      ))}
                                </pre>
                                {!c && activeLine !== n && (
                                  <MessageSquare className="w-3 h-3 mr-2 self-center flex-shrink-0 text-slate-500 opacity-0 group-hover:opacity-100" />
                                )}
                              </div>

                              {c && (
                                <div className="flex items-start gap-1.5 bg-amber-500/15 border-l-2 border-amber-400 pl-11 pr-2 py-1">
                                  <MessageSquare className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                                  <span className="text-amber-100 flex-1">{c.body}</span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); removeLineComment(n); }}
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
                    ) : (
                      <p className="text-sm text-muted-foreground p-6 text-center">
                        They pressed submit without any code in the editor. Worth asking them to turn
                        it in again.
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-500">Overall comments</Label>
                      <Textarea
                        value={comments}
                        onChange={(e) => { setComments(e.target.value); setSaved(false); }}
                        placeholder="Feedback on the whole submission..."
                        rows={8}
                        className="text-sm"
                      />
                      <CommentBank
                        compact
                        value={comments}
                        onChange={(v) => { setComments(v); setSaved(false); }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {lineComments.length > 0
                        ? `${lineComments.length} line comment${lineComments.length === 1 ? "" : "s"} will be saved with this.`
                        : "Line comments you add are saved with the grade."}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
