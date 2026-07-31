import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Pencil, Trash2, Users, ChevronDown, ChevronUp, Upload, Loader2, Mail, AlertTriangle } from "lucide-react";
import { parseRosterCsv } from "@/lib/rosterCsv";

export default function CourseCard({ course, onEdit, onDelete, onRosterChange }) {
  const [expanded, setExpanded] = useState(false);
  const [roster, setRoster] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  const [showUpload, setShowUpload] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const csvFileInputRef = useRef(null);

  useEffect(() => {
    if (expanded) loadRoster();
  }, [expanded, course.id]);

  const loadRoster = async () => {
    setLoadingRoster(true);
    try {
      setRoster(await base44.entities.Course.listRoster(course.id));
    } finally {
      setLoadingRoster(false);
    }
  };

  const handleCsvFile = async (e) => {
    const file = e.target.files?.[0];
    if (file) setCsvText(await file.text());
    e.target.value = "";
  };

  const parsed = parseRosterCsv(csvText);
  const withoutEmail = parsed.filter((p) => !p.email).length;

  const handleUpload = async () => {
    if (parsed.length === 0) return;
    setUploading(true);
    setUploadError("");
    try {
      await base44.entities.Course.replaceRoster(course.id, parsed);
      setShowUpload(false);
      setCsvText("");
      loadRoster();
      onRosterChange?.();
    } catch (e) {
      setUploadError(e.message || "Couldn't save that roster.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="p-5 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold">{course.name}</h3>
              <Badge variant="outline">
                {course.student_count ?? 0} student{(course.student_count ?? 0) !== 1 ? "s" : ""}
              </Badge>
            </div>
            {(course.student_count ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground">
                No roster yet - upload one to see who has not turned work in.
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setShowUpload(true)}>
              <Upload className="w-4 h-4 mr-1.5" /> Upload Roster
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </div>

        <div className="border-t">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50/50 transition-colors"
          >
            <Users className="w-4 h-4" />
            View Roster
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expanded && (
            <div className="px-5 pb-5 border-t pt-4">
              {loadingRoster ? (
                <p className="text-sm text-muted-foreground text-center py-4">Loading roster...</p>
              ) : roster.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No students on this roster yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roster.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.student_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {s.email || <span className="italic">no email</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={showUpload} onOpenChange={(open) => !open && setShowUpload(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Roster — {course.name}</DialogTitle>
            <DialogDescription>
              One student per line: <code className="text-xs">Name,email</code>. A header row is fine.
              This replaces the current roster.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={"Maria Lopez,mlopez@episcopalacademy.org\nJohn Smith,jsmith@episcopalacademy.org"}
              className="font-mono text-xs min-h-[160px]"
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => csvFileInputRef.current?.click()}>
                <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload .csv instead
              </Button>
              <input ref={csvFileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
            </div>

            {parsed.length > 0 && (
              <div className="text-xs space-y-1 border rounded-lg p-3 bg-slate-50/50">
                <p className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> {parsed.length} student{parsed.length !== 1 ? "s" : ""} found
                </p>
                {withoutEmail > 0 && (
                  <p className="flex items-start gap-1.5 text-amber-700">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      {withoutEmail} without an email — those will be matched by name, which is less
                      reliable than matching on the email students sign in with.
                    </span>
                  </p>
                )}
                {withoutEmail === 0 && (
                  <p className="flex items-center gap-1.5 text-emerald-700">
                    <Mail className="w-3.5 h-3.5" /> All have emails — matching will be exact.
                  </p>
                )}
              </div>
            )}

            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowUpload(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploading || parsed.length === 0}>
              {uploading ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...</>
              ) : (
                `Replace Roster (${parsed.length})`
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
