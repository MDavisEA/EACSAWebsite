import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import CommentBank from "./CommentBank";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FileDown, Trash2, ExternalLink, Loader2, Upload, CheckCircle2, XCircle, AlertTriangle, RefreshCw, UserX, ChevronDown, ChevronUp, Clock, Send } from "lucide-react";
import { exportProjectForReview } from "@/lib/exportProjectZip";
import { diffRosterAgainstSubmissions } from "@/lib/rosterCsv";

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
  const [submissions, setSubmissions] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
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
  const [reviewDraft, setReviewDraft] = useState({ teacher_comments: "", score: "", feedback_released: false });
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => {
    loadAll();
  }, [project.id, project.course_id]);

  const loadAll = async () => {
    setLoadError("");
    try {
      const subs = await base44.entities.Submission.filter(
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
      await exportProjectForReview(project, submissions, { googleDocText });
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

  const openReview = (s) => {
    setReviewTarget(s);
    setReviewDraft({
      teacher_comments: s.teacher_comments || "",
      score: s.score ?? "",
      feedback_released: !!s.feedback_released,
    });
  };

  const handleSaveReview = async () => {
    setSavingReview(true);
    try {
      await base44.entities.Submission.update(reviewTarget.id, {
        teacher_comments: reviewDraft.teacher_comments,
        score: reviewDraft.score === "" ? null : Number(reviewDraft.score),
        feedback_released: reviewDraft.feedback_released,
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
              <TableHead>Feedback</TableHead>
              <TableHead>Gist</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.map((s) => {
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
                    <Badge variant="outline">{(s.files || []).length}</Badge>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Feedback — {reviewTarget?.student_name}</DialogTitle>
            <DialogDescription>
              Paste the review from your Claude/Cowork pass, edit it however you like, then release it
              when you are ready. Nothing here is visible to the student until you release it.
            </DialogDescription>
          </DialogHeader>

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
              />
            </div>

            <div className="space-y-2 max-w-[160px]">
              <Label>Score (optional)</Label>
              <Input
                type="number"
                value={reviewDraft.score}
                onChange={(e) => setReviewDraft((d) => ({ ...d, score: e.target.value }))}
                placeholder="—"
              />
            </div>

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
