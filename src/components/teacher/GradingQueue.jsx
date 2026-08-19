import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import CommentBank from "./CommentBank";
import AnnotatedCodeView from "./AnnotatedCodeView";
import AnswerKeyPanel from "./AnswerKeyPanel";
import InteractiveRunner from "@/components/InteractiveRunner";
import {
  Loader2, ChevronLeft, ChevronRight, CheckCircle2, EyeOff, FileCode, Terminal, Info,
  KeyRound, ExternalLink,
} from "lucide-react";

const KIND_LABEL = { frq: "FRQ", code: "Mini Problem", review: "Coding Assignment", project: "Project" };

// Work through everything waiting on you, in one window, oldest first - so the
// student who has been waiting longest gets looked at first rather than
// whoever happens to be at the top of some course's list.
//
// The queue is deliberately its own grading surface rather than reusing the
// per-assignment viewers. Those are built around "one assignment, many
// students" - they own a list, a selection, and their own next/previous. A
// queue is the other axis: many assignments, one student at a time, crossing
// courses and work types. Trying to drive them from outside would mean opening
// a course, finding a card, expanding it, and opening a row for every single
// item.
//
// What it does NOT try to replace: the full per-assignment windows still hold
// the things that are about a whole assignment rather than one submission -
// class-wide autograder insights, CSV export, the project export zip. This is
// for getting through the pile.
export default function GradingQueue({ open, onOpenChange, onChanged }) {
  const [queue, setQueue] = useState(null);
  const [index, setIndex] = useState(0);
  const [loadError, setLoadError] = useState("");

  const [detail, setDetail] = useState(null); // { submission, work, kind }
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [score, setScore] = useState("");
  const [questionScores, setQuestionScores] = useState({});
  const [comments, setComments] = useState("");
  const [lineComments, setLineComments] = useState([]);
  const [release, setRelease] = useState(false);
  const [activeFile, setActiveFile] = useState(null);
  const [tab, setTab] = useState("feedback");
  // Kept across items on purpose: the pattern is looking at the key for the
  // first few of a pile and then not needing it, so collapsing it once should
  // stay collapsed for the rest of the run rather than reopening every student.
  const [showKeys, setShowKeys] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoadError("");
    setIndex(0);
    base44.entities.Submission.listNeedsGrading()
      // Only what is actually waiting - anything marked "won't grade" is a
      // decision already made and does not belong in a queue.
      .then((rows) => setQueue((rows || []).filter((r) => !r.grading_skipped)))
      .catch((e) => setLoadError(e.message || "Couldn't load the queue."));
  }, [open]);

  const current = queue?.[index] ?? null;

  // Loads the item at the cursor. Keyed on the submission id rather than the
  // index so re-ordering or removing an item cannot leave the panel showing
  // one student's work under another's name.
  useEffect(() => {
    if (!open || !current) { setDetail(null); return; }
    let cancelled = false;
    setLoadingDetail(true);
    setError("");
    base44.entities.Submission.getForGrading(current.id)
      .then((d) => {
        if (cancelled || !d) return;
        setDetail(d);
        const s = d.submission;
        setScore(s.score != null ? String(s.score) : "");
        setQuestionScores(
          Object.fromEntries(Object.entries(s.question_scores || {}).map(([k, v]) => [k, String(v)]))
        );
        setComments(s.teacher_comments || "");
        setLineComments(s.line_comments || []);
        setRelease(!!s.feedback_released);
        setActiveFile((s.files || [])[0]?.filename ?? null);
        setTab("feedback");
      })
      .catch((e) => { if (!cancelled) setError(e.message || "Couldn't load that submission."); })
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    return () => { cancelled = true; };
    // Keyed on the submission id, not the `current` object: removing a graded
    // item rebuilds the array, and depending on object identity would refetch
    // the same submission every time the queue changed underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current?.id]);

  const kind = detail?.kind;
  const work = detail?.work;
  const submission = detail?.submission;

  const isCode = kind === "code" || kind === "review";
  const commentScope = work
    ? kind === "frq"
      ? { assignment_id: work.id }
      : kind === "project"
      ? { project_id: work.id }
      : { coding_problem_id: work.id }
    : {};

  const maxPoints =
    kind === "frq"
      ? (work?.questions || []).reduce((sum, q) => sum + (Number(q.max_score ?? 9) || 0), 0) || null
      : kind === "review"
      ? work?.manual_points ?? work?.points_possible ?? null
      : kind === "code"
      ? work?.points_possible ?? null
      : null;

  // Only a Project has files, so only there does a comment need to record
  // which one it's on - everything else stores null, same as before Projects
  // had multiple files. Computed once and reused below rather than repeating
  // the kind check at every call site.
  const commentFile = kind === "project" ? activeFile : null;
  const addLineComment = (line, body) => {
    setLineComments((prev) => [
      ...prev.filter((c) => !((c.file ?? null) === commentFile && c.line === line)),
      commentFile != null ? { file: commentFile, line, body } : { line, body },
    ]);
  };
  const removeLineComment = (line) => {
    setLineComments((prev) => prev.filter((c) => !((c.file ?? null) === commentFile && c.line === line)));
  };

  const hasAnyKey =
    kind === "frq" &&
    (work?.questions || []).some(
      (q) =>
        q.answer_key_html ||
        q.answer_key_image_url ||
        (q.parts || []).some((p) => p.answer_key_html || p.answer_key_image_url)
    );

  // FRQ scores are per question and the total is their sum, matching what the
  // per-assignment grader writes - so a submission graded here and one graded
  // there are indistinguishable afterwards.
  const frqTotal = Object.values(questionScores).reduce((sum, v) => {
    const n = parseFloat(v);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  const advance = () => {
    // Removing the graded item rather than stepping past it keeps the counter
    // honest ("4 left" means four still need grading) and lands the cursor on
    // the next one without moving it.
    setQueue((prev) => {
      const next = (prev || []).filter((_, i) => i !== index);
      if (index >= next.length) setIndex(Math.max(0, next.length - 1));
      return next;
    });
    onChanged?.();
  };

  const save = async ({ then }) => {
    setSaving(true);
    setError("");
    try {
      const patch = { teacher_comments: comments, line_comments: lineComments };
      if (kind === "frq") {
        const parsed = Object.fromEntries(
          Object.entries(questionScores)
            .map(([k, v]) => [k, parseFloat(v)])
            .filter(([, v]) => !isNaN(v))
        );
        patch.question_scores = parsed;
        patch.score = Object.keys(parsed).length > 0 ? frqTotal : null;
      } else if (kind === "code") {
        // Autograded: never write `score` - the mark is autograde_score and a
        // null here would make it look hand-graded and ungraded at once.
      } else {
        const parsed = score.trim() === "" ? null : Number(score);
        patch.score = Number.isFinite(parsed) ? parsed : null;
      }
      if (kind === "project") patch.feedback_released = release;

      await base44.entities.Submission.update(submission.id, patch);
      if (then === "advance") advance();
      return true;
    } catch (e) {
      setError(e.message || "Couldn't save that.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    setSaving(true);
    setError("");
    try {
      await base44.entities.Submission.update(submission.id, { grading_skipped: true });
      advance();
    } catch (e) {
      setError(e.message || "Couldn't update that.");
    } finally {
      setSaving(false);
    }
  };

  const move = (delta) => {
    const next = index + delta;
    if (next < 0 || next >= (queue?.length || 0)) return;
    setIndex(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[93vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>Grading queue</span>
            {queue && (
              <span className="text-sm font-normal text-muted-foreground">
                {queue.length} left, oldest first
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loadError && <p className="text-sm text-destructive">{loadError}</p>}

        {queue === null ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : queue.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2 py-16 justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Nothing left to grade.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 flex-wrap border-b pb-3">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => move(-1)} disabled={index === 0}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-muted-foreground px-1">
                  {index + 1} of {queue.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => move(1)}
                  disabled={index >= queue.length - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className="flex-shrink-0">
                  {KIND_LABEL[current?.kind] || current?.kind}
                </Badge>
                <span className="font-medium truncate">{current?.title}</span>
                <span className="text-sm text-muted-foreground truncate">
                  {current?.student_name}
                </span>
                {current?.submitted_at && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    waiting since {format(new Date(current.submitted_at), "MMM d")}
                  </span>
                )}
              </div>

              {isCode && (
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
                </div>
              )}

              <div className={`flex items-center gap-2 ${isCode ? "" : "ml-auto"}`}>
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={skip} disabled={saving}>
                  <EyeOff className="w-3.5 h-3.5 mr-1.5" /> Won&rsquo;t grade
                </Button>
                <Button variant="outline" onClick={() => save({ then: "stay" })} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button onClick={() => save({ then: "advance" })} disabled={saving}>
                  Save &amp; next
                </Button>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {loadingDetail || !detail ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : isCode && tab === "testing" ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-slate-100 px-3 py-1.5 border-b flex items-center gap-2">
                  <span className="text-xs font-medium">Running {submission.student_name}&rsquo;s program</span>
                  <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" /> Already loaded. Press Run, then type into the console.
                  </span>
                </div>
                {(submission.code || "").trim() ? (
                  <InteractiveRunner
                    code={submission.code}
                    fileName={`${work.class_name || "Main"}.java`}
                    resetKey={submission.id}
                    height={520}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground p-6 text-center">
                    There is no code to run — they turned this in empty.
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 items-start">
                <div className="border rounded-lg overflow-hidden">
                  {/* What they turned in - code, files, or written answers. */}
                  {kind === "project" ? (
                    (submission.files || []).length > 0 ? (
                      <>
                        <div className="bg-slate-100 border-b px-2 py-1.5 flex items-center gap-1 flex-wrap">
                          {(submission.files || []).map((f) => {
                            const count = lineComments.filter((c) => (c.file ?? null) === f.filename).length;
                            return (
                              <button
                                key={f.filename}
                                onClick={() => setActiveFile(f.filename)}
                                className={`text-xs font-mono rounded px-2 py-1 transition-colors ${
                                  activeFile === f.filename
                                    ? "bg-white shadow-sm font-semibold"
                                    : "text-slate-500 hover:text-slate-800"
                                }`}
                              >
                                {f.filename}
                                {count > 0 && <span className="ml-1.5 text-amber-600">{count}</span>}
                              </button>
                            );
                          })}
                        </div>
                        <AnnotatedCodeView
                          key={`${submission.id}::${activeFile}`}
                          code={(submission.files || []).find((f) => f.filename === activeFile)?.content || ""}
                          file={activeFile}
                          comments={lineComments}
                          onAdd={addLineComment}
                          onRemove={removeLineComment}
                          commentScope={commentScope}
                          maxHeight="55vh"
                        />
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground p-6 text-center">
                        No files were captured from their gist.
                      </p>
                    )
                  ) : isCode ? (
                    (submission.code || "").trim() ? (
                      <>
                        <div className="bg-slate-100 px-3 py-1.5 text-xs text-muted-foreground border-b">
                          Click any line to comment on it
                        </div>
                        <AnnotatedCodeView
                          key={submission.id}
                          code={submission.code}
                          comments={lineComments}
                          onAdd={addLineComment}
                          onRemove={removeLineComment}
                          commentScope={commentScope}
                          maxHeight="55vh"
                        />
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground p-6 text-center">
                        They turned this in without any code.
                      </p>
                    )
                  ) : (
                    // FRQ: their written answer per question, with a score box
                    // each. Answer-key images and the lightbox stay in the full
                    // per-assignment grader rather than being half-rebuilt here.
                    <div className="max-h-[60vh] overflow-y-auto">
                      {/* Answer keys fold away rather than being absent - see
                          showKeys above for why the choice persists. */}
                      {(hasAnyKey || work.answer_key_url) && (
                        <div className="flex items-center gap-3 px-3 py-2 border-b bg-slate-50 sticky top-0">
                          {hasAnyKey && (
                            <button
                              onClick={() => setShowKeys((v) => !v)}
                              className="text-xs flex items-center gap-1.5 text-amber-700 hover:text-amber-900"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              {showKeys ? "Hide answer keys" : "Show answer keys"}
                            </button>
                          )}
                          {work.answer_key_url && (
                            <a
                              href={work.answer_key_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs flex items-center gap-1.5 text-primary hover:underline ml-auto"
                            >
                              Full answer key <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      )}
                      <div className="divide-y">
                      {(work.questions || []).map((q) => {
                        const parts = q.parts && q.parts.length > 0 ? q.parts : null;
                        return (
                          <div key={q.id} className="p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium flex-1">{q.title}</p>
                              <Input
                                type="number"
                                value={questionScores[q.id] ?? ""}
                                onChange={(e) =>
                                  setQuestionScores((prev) => ({ ...prev, [q.id]: e.target.value }))
                                }
                                className="w-16 h-8 text-center"
                                placeholder="—"
                              />
                              <span className="text-xs text-muted-foreground">/ {q.max_score ?? 9}</span>
                            </div>
                            {(parts || [{ id: null, label: null }]).map((p) => {
                              const key = p.id ? `${q.id}_${p.id}` : q.id;
                              const text = (submission.responses || {})[key];
                              const keyHtml = p.id ? p.answer_key_html : q.answer_key_html;
                              const keyImageUrl = p.id ? p.answer_key_image_url : q.answer_key_image_url;
                              return (
                                <div key={key}>
                                  {p.label && (
                                    <p className="text-xs font-medium text-muted-foreground mb-0.5">
                                      Part ({p.label})
                                    </p>
                                  )}
                                  <pre className="bg-slate-50 border rounded p-2 text-xs whitespace-pre-wrap font-mono">
                                    {text?.trim() ? text : "(left blank)"}
                                  </pre>
                                  {showKeys && (
                                    <div className="mt-1.5">
                                      <AnswerKeyPanel
                                        keyHtml={keyHtml}
                                        keyImageUrl={keyImageUrl}
                                        onZoom={setLightboxUrl}
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                      {(work.questions || []).length === 0 && (
                        <p className="text-sm text-muted-foreground p-6 text-center">
                          This assignment has no questions.
                        </p>
                      )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {kind === "frq" ? (
                    <p className="text-sm">
                      Total <span className="font-semibold">{frqTotal}</span>
                      {maxPoints != null && <span className="text-muted-foreground"> / {maxPoints}</span>}
                      <span className="text-xs text-muted-foreground block">
                        Summed from the per-question scores.
                      </span>
                    </p>
                  ) : kind === "code" ? (
                    <p className="text-sm">
                      Autograded{" "}
                      <span className="font-semibold">
                        {submission.autograde_score ?? "—"}
                        {maxPoints != null && ` / ${maxPoints}`}
                      </span>
                      <span className="text-xs text-muted-foreground block">
                        Scored by the tests. Your feedback below is what a human adds.
                      </span>
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-slate-500 whitespace-nowrap">
                        Score{maxPoints != null ? ` / ${maxPoints}` : ""}
                      </Label>
                      <Input
                        type="number"
                        value={score}
                        onChange={(e) => setScore(e.target.value)}
                        className="w-20 text-center"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">Overall comments</Label>
                    <Textarea
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      placeholder="Feedback on the whole submission..."
                      rows={8}
                      className="text-sm"
                    />
                    <CommentBank compact value={comments} onChange={setComments} scope={commentScope} />
                  </div>

                  {kind === "project" && (
                    <div className="flex items-center gap-2 border-t pt-3">
                      <Switch checked={release} onCheckedChange={setRelease} />
                      <Label className="text-sm">Release this feedback to the student</Label>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    {lineComments.length > 0
                      ? `${lineComments.length} line comment${lineComments.length === 1 ? "" : "s"} will be saved with this.`
                      : "Click a line on the left to comment on it."}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>

      {/* Keys are often photographs of a rubric page, unreadable at column
          width - clicking one opens it full size. */}
      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="max-w-[92vw] w-fit p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Answer key</DialogTitle>
          </DialogHeader>
          {lightboxUrl && (
            <img src={lightboxUrl} alt="Answer key" className="max-h-[85vh] max-w-full rounded" />
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
