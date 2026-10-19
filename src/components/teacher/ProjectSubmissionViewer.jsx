import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import CommentBank from "./CommentBank";
import AnnotatedCodeView from "./AnnotatedCodeView";
import GradesDialog from "./GradesDialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FileDown, Trash2, ExternalLink, Loader2, Upload, CheckCircle2, XCircle, AlertTriangle, RefreshCw, UserX, ChevronDown, ChevronUp, Clock, Send, Bot } from "lucide-react";
import AiHelpBadge from "./AiHelpBadge";
import SketchTestingPanel, { FeedbackTestingToggle } from "./SketchTestingPanel";
import { baseName, groupFilesByPart, itemsTotalPoints, partIdOf, scoreItems, sumPartScores } from "@/lib/processing/programs";
import WrittenAnswers from "./WrittenAnswers";
import { exportProjectForReview } from "@/lib/exportProjectZip";
import { diffRosterAgainstSubmissions } from "@/lib/rosterCsv";
import { byLastName } from "@/lib/groupSubmissionsByStudent";
import { getCachedList, setCachedList } from "@/lib/submissionListCache";

// Matches the plain `name,gist_url` per line format already used by the
// MOSS-checking script's gists.csv - one comma splits name from URL, the
// rest of the line (in case a URL ever had one) is the URL.
function parseGistCsv(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(",");
      if (idx === -1) return null;
      return { student_name: line.slice(0, idx).trim(), gist_url: line.slice(idx + 1).trim() };
    })
    .filter(Boolean);
}

export default function ProjectSubmissionViewer({ project }) {
  const LIST_KEY = { project_id: project.id, submitted: true };
  // Paints from whatever was shown last time, then the fetch below
  // replaces it - so re-opening this card is instant instead of blank.
  const [submissions, setSubmissions] = useState(() => getCachedList(LIST_KEY) || []);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(() => !getCachedList(LIST_KEY));
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showMissing, setShowMissing] = useState(false);

  const [rechecking, setRechecking] = useState(false);
  const [recheckResults, setRecheckResults] = useState(null);

  const [showBulkImport, setShowBulkImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const csvFileInputRef = useRef(null);

  const [reviewTarget, setReviewTarget] = useState(null);
  // Sketches (Processing courses) get the Feedback / Testing toggle a Coding
  // Assignment has: read and comment, or run what they turned in.
  const isSketch = project.kind === "sketch";
  const [reviewTab, setReviewTab] = useState("feedback");
  // The program open in the Output view, shared with the Code view so clicking
  // over lands on the same program.
  const [partKey, setPartKey] = useState(null);
  // A problem set: several programs, each scored separately and summed.
  const parts = isSketch ? project.parts || [] : [];
  const hasParts = parts.length > 0;
  // Everything with its own score: written questions, then programs (a bonus one is marked).
  // Empty means the plain single score a one-program sketch has always had.
  const items = isSketch ? scoreItems(project) : [];
  const hasItems = items.length > 0;
  // The most this assignment can score: its programs' points added up, or - for a
  // single program - the total the teacher set. Null when neither is known, in
  // which case there is no Full credit button (nothing to give full credit of).
  const maxPoints = itemsTotalPoints(items) ?? (project.points_possible != null && !hasItems ? Number(project.points_possible) : null);
  const [reviewScores, setReviewScores] = useState({}); // programId -> typed score
  const [reviewDraft, setReviewDraft] = useState({
    teacher_comments: "",
    score: "",
    feedback_released: false,
    feedback_ack_required: false,
  });
  const [lineComments, setLineComments] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [savingReview, setSavingReview] = useState(false);
  const [gradesOpen, setGradesOpen] = useState(false);
  // The opened submission's files, still arriving (they are not in the list).
  const [filesLoading, setFilesLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");

  // Whatever is on screen is what a re-open should paint first - including
  // edits made locally after saving a grade, so this syncs on every change
  // rather than only on fetch.
  useEffect(() => {
    if (!loading) setCachedList(LIST_KEY, submissions);
    // LIST_KEY is rebuilt each render, so the id it is derived from is the
    // real dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, submissions, loading]);

  useEffect(() => {
    loadAll();
  }, [project.id, project.course_id]);

  const loadAll = async () => {
    setLoadError("");
    try {
      const subs = await base44.entities.Submission.filterSummary(
        { project_id: project.id, submitted: true },
        "-submitted_at"
      );
      setSubmissions(subs);
      setRoster(project.course_id ? await base44.entities.Course.listRoster(project.course_id) : []);
    } catch (e) {
      // Without this, a failed fetch left the spinner up forever with no
      // indication anything had gone wrong.
      setLoadError(e.message || "Couldn't load submissions. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (deleteTarget) {
      await base44.entities.Submission.delete(deleteTarget.id);
      setDeleteTarget(null);
      loadAll();
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError("");
    try {
      let googleDocText;
      if (project.google_doc_url) {
        // Fetched fresh here rather than relying on anything cached, so the
        // export always reflects the current text of the doc. If this fails
        // (not shared publicly, deleted, etc.), stop rather than silently
        // shipping a review pass missing the real directions.
        const result = await base44.entities.Project.fetchGoogleDocText(project.google_doc_url);
        googleDocText = result.text;
      }
      // The zip is one folder of real .java files per student, so this is the
      // one place that genuinely needs every submission's file contents - the
      // list itself only carries filenames. Re-fetched in full here rather
      // than making every "View Submissions" click pay for it.
      const full = await base44.entities.Submission.filter(
        { project_id: project.id, submitted: true },
        "-submitted_at"
      );
      await exportProjectForReview(project, full, { googleDocText });
    } catch (e) {
      setExportError(e.message || "Couldn't build the export.");
    } finally {
      setExporting(false);
    }
  };

  const handleRecheck = async () => {
    setRechecking(true);
    try {
      const results = await base44.entities.Submission.recheckGists(project.id);
      const byId = {};
      results.forEach((r) => { byId[r.submission_id] = r; });
      setRecheckResults(byId);
    } finally {
      setRechecking(false);
    }
  };

  const handleCsvFile = async (e) => {
    const file = e.target.files?.[0];
    if (file) setCsvText(await file.text());
    e.target.value = "";
  };

  const handleBulkImport = async () => {
    const rows = parseGistCsv(csvText);
    if (rows.length === 0) return;
    setImporting(true);
    setImportResults(null);
    try {
      setImportResults(await base44.entities.Submission.bulkImportProject(project.id, rows));
      loadAll();
    } finally {
      setImporting(false);
    }
  };

  const closeBulkImport = () => {
    setShowBulkImport(false);
    setCsvText("");
    setImportResults(null);
  };

  // The list carries filenames only - the snapshotted file CONTENTS are the
  // bulk of a project submission (roughly three quarters of it, measured), and
  // are only ever read for the one submission being reviewed. Opens on the
  // summary immediately and fills in the files as they arrive.
  const openReview = async (s) => {
    setReviewTarget(s);
    setReviewDraft({
      teacher_comments: s.teacher_comments || "",
      score: s.score ?? "",
      feedback_released: !!s.feedback_released,
      feedback_ack_required: !!s.feedback_ack_required,
    });
    setLineComments([]);
    setReviewScores(Object.fromEntries(Object.entries(s.question_scores || {}).map(([k, v]) => [k, String(v)])));
    setReviewError("");
    // What you are marking in a sketch is what it does, so that is what opens.
    setReviewTab(isSketch ? "testing" : "feedback");
    setPartKey(null);
    // Open on their first file rather than nothing, so the code is visible
    // without a click - a Project is usually one main class plus helpers.
    setActiveFile((s.file_names || [])[0] ?? null);
    setFilesLoading(true);
    try {
      const full = await base44.entities.Submission.getFull(s.id);
      // Dropped if the teacher has already moved on to someone else.
      setReviewTarget((cur) => (cur && cur.id === full.id ? { ...cur, ...full } : cur));
      setLineComments((cur) => (cur.length === 0 ? full.line_comments || [] : cur));
      setReviewScores((cur) =>
        Object.keys(cur).length === 0
          ? Object.fromEntries(Object.entries(full.question_scores || {}).map(([k, v]) => [k, String(v)]))
          : cur
      );
    } catch (e) {
      setReviewError(e.message || "Couldn't load this submission's files.");
    } finally {
      setFilesLoading(false);
    }
  };

  // A Project is several files, so which file a comment sits on has to be part
  // of the comment. Single-file work stores no `file` at all, which is also
  // what every comment written before this looked like - so the old and new
  // shapes read identically and nothing needed migrating.
  const addLineComment = (line, body) => {
    setLineComments((prev) => [
      ...prev.filter((c) => !((c.file ?? null) === activeFile && c.line === line)),
      { file: activeFile, line, body },
    ]);
  };

  const removeLineComment = (line) => {
    setLineComments((prev) =>
      prev.filter((c) => !((c.file ?? null) === activeFile && c.line === line))
    );
  };

  const handleSaveReview = async () => {
    setSavingReview(true);
    try {
      let perProgram = {};
      if (hasItems) {
        const ids = new Set(items.map((p) => p.id));
        perProgram = Object.fromEntries(
          Object.entries(reviewScores)
            .filter(([k]) => ids.has(k))
            .map(([k, v]) => [k, parseFloat(v)])
            .filter(([, v]) => !isNaN(v))
        );
      }
      await base44.entities.Submission.update(reviewTarget.id, {
        teacher_comments: reviewDraft.teacher_comments,
        // With programs the total is the sum of the per-program scores, which are
        // filed under each program's id (the same column an FRQ uses).
        ...(hasItems ? { question_scores: perProgram } : {}),
        score: hasItems
          ? (Object.keys(perProgram).length > 0 ? sumPartScores(perProgram) : null)
          : reviewDraft.score === "" ? null : Number(reviewDraft.score),
        feedback_released: reviewDraft.feedback_released,
        feedback_ack_required: reviewDraft.feedback_ack_required,
        line_comments: lineComments,
      });
      setReviewTarget(null);
      loadAll();
    } finally {
      setSavingReview(false);
    }
  };

  const isLate = (s) =>
    project.due_date && s.submitted_at && new Date(s.submitted_at) > new Date(project.due_date);

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading submissions...</div>;
  }

  if (loadError) {
    return (
      <div className="py-8 text-center space-y-3">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" size="sm" onClick={() => { setLoading(true); loadAll(); }}>
          Try again
        </Button>
      </div>
    );
  }

  const { missing, unmatched } = roster.length > 0
    ? diffRosterAgainstSubmissions(roster, submissions)
    : { missing: [], unmatched: [] };

  // Alphabetical by last name - a class list being worked through, so
  // finding one particular person matters more than who happened to submit
  // last. This is display-only: `submissions` itself (used for counts, the
  // roster diff, export) stays in its original order.
  const sortedSubmissions = [...submissions].sort(byLastName);

  return (
    <div className="pt-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          {roster.length > 0 ? (
            <span>
              <span className="font-medium text-foreground">
                {submissions.length} of {roster.length}
              </span>{" "}
              turned in
            </span>
          ) : (
            <span>{submissions.length} submission{submissions.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Both are about Gists, which a sketch does not have. */}
          {!isSketch && (
            <>
              <Button variant="outline" size="sm" onClick={handleRecheck} disabled={rechecking || submissions.length === 0}>
                {rechecking ? (
                  <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Checking...</>
                ) : (
                  <><RefreshCw className="w-4 h-4 mr-1.5" /> Re-check Gists</>
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowBulkImport(true)}>
                <Upload className="w-4 h-4 mr-1.5" /> Bulk Import (CSV)
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setGradesOpen(true)}>
            Grades
          </Button>
          <Button size="sm" onClick={handleExport} disabled={exporting || submissions.length === 0}>
            {exporting ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Building zip...</>
            ) : (
              <><FileDown className="w-4 h-4 mr-1.5" /> Export for Review</>
            )}
          </Button>
        </div>
      </div>
      {exportError && <p className="text-sm text-destructive">{exportError}</p>}

      {!project.course_id && (
        <p className="text-xs text-muted-foreground border rounded-lg p-3 bg-slate-50/50">
          This project has no course set, so there is nothing to compare against. Assign a course in
          the project settings to see who has not turned in.
        </p>
      )}

      {missing.length > 0 && (
        <div className="border border-amber-200 bg-amber-50/50 rounded-lg">
          <button
            onClick={() => setShowMissing(!showMissing)}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-amber-900 hover:bg-amber-50 transition-colors"
          >
            <UserX className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">
              {missing.length} student{missing.length !== 1 ? "s" : ""} have not turned in
            </span>
            {showMissing ? (
              <ChevronUp className="w-4 h-4 ml-auto" />
            ) : (
              <ChevronDown className="w-4 h-4 ml-auto" />
            )}
          </button>
          {showMissing && (
            <div className="px-4 pb-3 flex flex-wrap gap-1.5">
              {missing.map((m) => (
                <Badge key={m.id} variant="outline" className="bg-white font-normal">
                  {m.student_name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {unmatched.length > 0 && (
        <p className="text-xs text-muted-foreground border rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
          <span>
            {unmatched.length} submission{unmatched.length !== 1 ? "s" : ""} did not match anyone on
            the roster ({unmatched.map((u) => u.student_name).join(", ")}). Usually a name typo, a
            bulk import without emails, or a roster that needs updating.
          </span>
        </p>
      )}

      {submissions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No submissions yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Files</TableHead>
              <TableHead>AI Help</TableHead>
              <TableHead>Feedback</TableHead>
              {!isSketch && <TableHead>Gist</TableHead>}
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSubmissions.map((s) => {
              const recheck = recheckResults?.[s.id];
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {s.student_name}
                      {recheck?.status === "edited" && (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 font-normal">
                          edited after submitting
                        </Badge>
                      )}
                      {recheck?.status === "error" && (
                        <Badge variant="outline" className="text-muted-foreground font-normal" title={recheck.error}>
                          gist unreachable
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      {s.submitted_at ? format(new Date(s.submitted_at), "MMM d, h:mm a") : "—"}
                      {isLate(s) && (
                        <Badge variant="outline" className="text-destructive border-destructive/30 font-normal">
                          <Clock className="w-3 h-3 mr-1" /> late
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{(s.file_names || []).length}</Badge>
                  </TableCell>
                  <TableCell>
                    <AiHelpBadge submission={s} />
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => openReview(s)}
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {s.feedback_released ? (
                        <><Send className="w-3 h-3" /> released</>
                      ) : s.teacher_comments || s.score != null ? (
                        "draft"
                      ) : (
                        "add"
                      )}
                    </button>
                  </TableCell>
                  {/* A sketch is pasted into the site, so there is no Gist to link to. */}
                  {!isSketch && (
                    <TableCell>
                      <a
                        href={s.gist_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                      >
                        View <ExternalLink className="w-3 h-3" />
                      </a>
                    </TableCell>
                  )}
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(s)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <GradesDialog
        open={gradesOpen}
        onOpenChange={setGradesOpen}
        title={project.title}
        submissions={submissions}
        courseId={project.course_id}
        preloadedRoster={roster}
        maxPoints={maxPoints}
        scoreOf={(s) => s.score ?? null}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Submission?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {deleteTarget?.student_name}'s submission. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!reviewTarget} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[93vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span>Feedback — {reviewTarget?.student_name}</span>
              {reviewTarget && <AiHelpBadge submission={reviewTarget} />}
            </DialogTitle>
            <DialogDescription>
              Paste the review from your Claude/Cowork pass, edit it however you like, then release it
              when you are ready. Nothing here is visible to the student until you release it.
            </DialogDescription>
          </DialogHeader>

          {isSketch && (
            <FeedbackTestingToggle tab={reviewTab} onTab={setReviewTab} className="w-fit" sketch />
          )}

          {isSketch && (project.questions || []).length > 0 && reviewTarget && (
            <WrittenAnswers questions={project.questions} answers={reviewTarget.answers} scores={reviewScores} />
          )}

          {isSketch && reviewTab === "testing" && reviewTarget && (
            reviewTarget.files === undefined ? (
              <p className="text-sm text-muted-foreground p-6 text-center flex items-center justify-center gap-2 border rounded-lg">
                <span className="w-4 h-4 border-2 border-slate-300 border-t-primary rounded-full animate-spin" />
                Loading their sketch...
              </p>
            ) : (
              <SketchTestingPanel
                submission={reviewTarget}
                projectTitle={project.title}
                parts={parts}
                height={520}
                selectedKey={partKey}
                onSelect={(key) => {
                  setPartKey(key);
                  const g = groupFilesByPart(reviewTarget.files, parts).find((x) => x.key === key);
                  if (g && !g.files.some((f) => f.filename === activeFile)) setActiveFile(g.files[0].filename);
                }}
              />
            )
          )}

          {/* Their actual code, one file at a time, with comments pinned to
              lines - the same thing Coding Assignments have. Before this the
              only way to say anything about a Project was one block of prose,
              which is a poor fit for "line 34 of Board.java is the problem". */}
          {!(isSketch && reviewTab === "testing") && (reviewTarget?.file_names || reviewTarget?.files || []).length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-slate-100 border-b px-2 py-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap">
                {groupFilesByPart(
                  (reviewTarget.file_names ?? (reviewTarget.files || []).map((f) => f.filename)).map((filename) => ({ filename })),
                  parts
                ).map((g) => (
                  <div key={g.key} className="flex items-center gap-1 flex-wrap">
                    {hasParts && g.title && (
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mr-0.5">{g.title}</span>
                    )}
                    {g.files.map(({ filename }) => {
                      const count = lineComments.filter((c) => (c.file ?? null) === filename).length;
                      return (
                        <button
                          key={filename}
                          onClick={() => { setActiveFile(filename); setPartKey(partIdOf({ filename }) ?? "__none__"); }}
                          className={`text-xs font-mono rounded px-2 py-1 transition-colors ${
                            activeFile === filename
                              ? "bg-white shadow-sm font-semibold"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {hasParts ? baseName(filename) : filename}
                          {count > 0 && <span className="ml-1.5 text-amber-600">{count}</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
                <span className="text-xs text-muted-foreground ml-auto pr-1">
                  Click any line to comment on it
                </span>
              </div>
              {filesLoading && reviewTarget.files === undefined ? (
                <p className="text-sm text-muted-foreground p-6 text-center flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-slate-300 border-t-primary rounded-full animate-spin" />
                  Loading their files...
                </p>
              ) : (
                <AnnotatedCodeView
                  key={activeFile}
                  code={(reviewTarget.files || []).find((f) => f.filename === activeFile)?.content || ""}
                  file={activeFile}
                  comments={lineComments}
                  onAdd={addLineComment}
                  onRemove={removeLineComment}
                  commentScope={{ project_id: project.id }}
                  maxHeight="45vh"
                />
              )}
              {reviewError && (
                <p className="text-sm text-destructive px-3 py-2 border-t">{reviewError}</p>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Review</Label>
              <Textarea
                value={reviewDraft.teacher_comments}
                onChange={(e) => setReviewDraft((d) => ({ ...d, teacher_comments: e.target.value }))}
                placeholder="Paste or write the feedback this student should see..."
                className="text-sm min-h-[220px]"
              />
              <CommentBank
                compact
                value={reviewDraft.teacher_comments}
                onChange={(next) => setReviewDraft((d) => ({ ...d, teacher_comments: next }))}
                scope={{ project_id: project.id }}
              />
            </div>

            {/* Easy to miss up next to the name and timestamp - repeated
                here, right where the feedback itself gets written, whenever
                the student actually said yes. */}
            {reviewTarget?.ai_help_used && (
              <div className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <Bot className="w-4 h-4 text-amber-700 flex-shrink-0" />
                <a
                  href={reviewTarget.ai_help_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-700 hover:underline break-all flex-1"
                >
                  {reviewTarget.ai_help_link}
                </a>
                <ExternalLink className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
              </div>
            )}

            {hasItems ? (
              <div className="space-y-2 max-w-md">
                <div className="flex items-center justify-between">
                  <Label>{items.some((p) => p.kind === "question") ? "Score each question and program" : "Score each program"}</Label>
                  {items.some((p) => !p.optional && p.points != null) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-green-700 border-green-300 hover:bg-green-50"
                      onClick={() =>
                        setReviewScores((q) => ({
                          ...q,
                          ...Object.fromEntries(items.filter((p) => !p.optional && p.points != null).map((p) => [p.id, String(p.points)])),
                        }))
                      }
                    >
                      Full credit
                    </Button>
                  )}
                </div>
                {items.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="text-sm flex-1 truncate" title={p.label}>{p.label}</span>
                    <Input
                      type="number"
                      value={reviewScores[p.id] ?? ""}
                      onChange={(e) => setReviewScores((q) => ({ ...q, [p.id]: e.target.value }))}
                      className="w-20 text-center h-8"
                    />
                    {typeof p.points === "number" && (
                      <button
                        type="button"
                        onClick={() => setReviewScores((q) => ({ ...q, [p.id]: String(p.points) }))}
                        className="text-xs text-muted-foreground hover:text-green-700 w-10 text-left"
                        title="Full credit for this one"
                      >
                        / {p.points}
                      </button>
                    )}
                  </div>
                ))}
                <p className="text-sm">
                  Total <span className="font-semibold">{sumPartScores(reviewScores) ?? "—"}</span>
                  {itemsTotalPoints(items) != null && <span className="text-muted-foreground"> / {itemsTotalPoints(items)}</span>}
                  <span className="text-xs text-muted-foreground"> &middot; added up from the {items.some((p) => p.kind === "question") ? "questions and programs" : "programs"}</span>
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Score{maxPoints != null ? ` / ${maxPoints}` : " (optional)"}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={reviewDraft.score}
                    onChange={(e) => setReviewDraft((d) => ({ ...d, score: e.target.value }))}
                    placeholder="—"
                    className="w-24"
                  />
                  {maxPoints != null && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-green-700 border-green-300 hover:bg-green-50"
                      onClick={() => setReviewDraft((d) => ({ ...d, score: String(maxPoints) }))}
                    >
                      Full credit
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 border-t pt-4">
              <Switch
                checked={reviewDraft.feedback_released}
                onCheckedChange={(v) => setReviewDraft((d) => ({ ...d, feedback_released: v }))}
              />
              <div>
                <Label>Release to student</Label>
                <p className="text-xs text-muted-foreground">
                  When on, this appears under My Work for that student.
                </p>
              </div>
            </div>

            {/* Puts this on their dashboard's Outstanding Feedback shelf
                instead of the normal graded list, until they actively
                confirm they read it - for feedback that genuinely needs to
                land, not every routine grade. */}
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={reviewDraft.feedback_ack_required}
                onCheckedChange={(v) => setReviewDraft((d) => ({ ...d, feedback_ack_required: !!v }))}
                className="mt-0.5"
              />
              <span>
                Require the student to confirm they&rsquo;ve read this
                <span className="block text-xs text-muted-foreground">
                  Shows up front on their dashboard until they actively acknowledge it.
                </span>
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setReviewTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveReview} disabled={savingReview}>
              {savingReview ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...</>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkImport} onOpenChange={(open) => !open && closeBulkImport()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Import from CSV</DialogTitle>
            <DialogDescription>
              One line per student: <code className="text-xs">name,gist_url</code> - no sign-in needed. Useful
              for testing, or importing gists collected before students could submit directly.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={"Maria Lopez,https://gist.github.com/mlopez/6cad326836d38bd3a7ae\nJohn Smith,https://gist.github.com/jsmith22/9f8e7d6c5b4a3f2e1d"}
              className="font-mono text-xs min-h-[160px]"
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => csvFileInputRef.current?.click()}>
                <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload .csv instead
              </Button>
              <input ref={csvFileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
            </div>

            {importResults && (
              <div className="space-y-1 max-h-48 overflow-y-auto border rounded-lg p-3">
                {importResults.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    {r.status === "ok" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
                    )}
                    <span>
                      <span className="font-medium">{r.student_name}</span>
                      {r.error && <span className="text-muted-foreground"> — {r.error}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={closeBulkImport}>
              Close
            </Button>
            <Button onClick={handleBulkImport} disabled={importing || !csvText.trim()}>
              {importing ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Importing...</>
              ) : (
                "Import"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
