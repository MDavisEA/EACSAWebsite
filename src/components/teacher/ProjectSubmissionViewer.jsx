import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FileDown, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { exportProjectForReview } from "@/lib/exportProjectZip";

export default function ProjectSubmissionViewer({ project }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

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

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading submissions...</div>;
  }

  return (
    <div className="pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {submissions.length} submission{submissions.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={handleExport} disabled={exporting || submissions.length === 0}>
          {exporting ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Building zip...</>
          ) : (
            <><FileDown className="w-4 h-4 mr-1.5" /> Export for Review</>
          )}
        </Button>
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
    </div>
  );
}
