import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FileDown, Trash2, ExternalLink, Loader2, Upload, CheckCircle2, XCircle } from "lucide-react";
import { exportProjectForReview } from "@/lib/exportProjectZip";

// Matches the plain `name,gist_url` per line format already used by the
// MOSS-checking script's gists.csv - one comma splits name from URL, the
// rest of the line (in case a URL ever had one) is the URL.
function parseCsv(text) {
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
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [showBulkImport, setShowBulkImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const csvFileInputRef = useRef(null);

  useEffect(() => {
    loadSubmissions();
  }, [project.id]);

  const loadSubmissions = async () => {
    const results = await base44.entities.Submission.filter(
      { project_id: project.id, submitted: true },
      "-submitted_at"
    );
    setSubmissions(results);
    setLoading(false);
  };

  const handleDelete = async () => {
    if (deleteTarget) {
      await base44.entities.Submission.delete(deleteTarget.id);
      setDeleteTarget(null);
      loadSubmissions();
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

  const handleCsvFile = async (e) => {
    const file = e.target.files?.[0];
    if (file) setCsvText(await file.text());
    e.target.value = "";
  };

  const handleBulkImport = async () => {
    const rows = parseCsv(csvText);
    if (rows.length === 0) return;
    setImporting(true);
    setImportResults(null);
    try {
      const results = await base44.entities.Submission.bulkImportProject(project.id, rows);
      setImportResults(results);
      loadSubmissions();
    } finally {
      setImporting(false);
    }
  };

  const closeBulkImport = () => {
    setShowBulkImport(false);
    setCsvText("");
    setImportResults(null);
  };

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading submissions...</div>;
  }

  return (
    <div className="pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {submissions.length} submission{submissions.length !== 1 ? "s" : ""}
        </p>
        <div className="flex gap-2">
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

      {submissions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No submissions yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Files</TableHead>
              <TableHead>Gist</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.student_name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {s.submitted_at ? format(new Date(s.submitted_at), "MMM d, h:mm a") : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{(s.files || []).length}</Badge>
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
            ))}
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
