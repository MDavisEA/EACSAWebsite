import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Loader2, Mail } from "lucide-react";
import { latestPerStudent } from "@/lib/groupSubmissionsByStudent";
import { diffRosterAgainstSubmissions } from "@/lib/rosterCsv";

// Every student's mark for ONE assignment, in a list built for copying into
// Canvas by hand. Deliberately not a gradebook: no cross-assignment view, no
// totals, no averages - the job is "read down this column and type it in over
// there", and anything else on screen is in the way of that.
//
// Sorting by first or last name is the whole reason this is not just the
// submissions table: Canvas sorts by last name, so a list ordered by first
// name means hunting for every row. `student_name` is one string, so the two
// orders come from splitting it - imperfect for compound surnames, but the
// alternative is asking teachers to maintain two name fields.
function nameParts(full) {
  const cleaned = String(full ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) return { first: "", last: "" };
  const bits = cleaned.split(" ");
  if (bits.length === 1) return { first: bits[0], last: bits[0] };
  return { first: bits[0], last: bits[bits.length - 1] };
}

export default function GradesDialog({
  open,
  onOpenChange,
  title,
  submissions,
  courseId,
  preloadedRoster,
  maxPoints,
  scoreOf,
}) {
  const [sortBy, setSortBy] = useState("last");
  const [fetchedRoster, setFetchedRoster] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [copied, setCopied] = useState(false);

  // The roster is what makes "who has no grade yet" answerable - without it
  // this can only list people who turned something in, which is the wrong list
  // to work from when entering marks for a whole class. Skipped when the
  // caller already has one loaded (ProjectSubmissionViewer keeps its own for
  // the "who hasn't turned in" table) - fetching it twice for the same
  // course, every time this dialog opens, was pure waste.
  useEffect(() => {
    if (!open || !courseId || preloadedRoster) return;
    let cancelled = false;
    setLoadingRoster(true);
    base44.entities.Course.listRoster(courseId)
      .then((r) => { if (!cancelled) setFetchedRoster(r || []); })
      .catch(() => { if (!cancelled) setFetchedRoster([]); })
      .finally(() => { if (!cancelled) setLoadingRoster(false); });
    return () => { cancelled = true; };
  }, [open, courseId, preloadedRoster]);

  const roster = preloadedRoster || fetchedRoster;

  const rows = useMemo(() => {
    const latest = latestPerStudent(submissions || []);
    const submitted = latest.map((s) => {
      const score = scoreOf(s);
      return {
        key: s.id,
        name: s.student_name || "(no name)",
        score,
        turnedIn: true,
        submittedAt: s.submitted_at,
      };
    });

    // Roster students with nothing turned in still need a row - they are
    // usually the ones that need a zero typed into Canvas.
    const { missing } = roster.length
      ? diffRosterAgainstSubmissions(roster, latest)
      : { missing: [] };
    const notIn = missing.map((r) => ({
      key: `missing-${r.email || r.student_name}`,
      name: r.student_name || r.email,
      email: r.email || null,
      score: null,
      turnedIn: false,
      submittedAt: null,
    }));

    const all = [...submitted, ...notIn];
    return all.sort((a, b) => {
      const pa = nameParts(a.name);
      const pb = nameParts(b.name);
      const primary =
        sortBy === "last"
          ? pa.last.localeCompare(pb.last) || pa.first.localeCompare(pb.first)
          : pa.first.localeCompare(pb.first) || pa.last.localeCompare(pb.last);
      return primary;
    });
  }, [submissions, roster, sortBy, scoreOf]);

  const gradedCount = rows.filter((r) => r.score != null).length;

  // Only real addresses - a roster row with no email (matched by name only)
  // has nothing to send to.
  const missingEmails = rows.filter((r) => !r.turnedIn && r.email).map((r) => r.email);
  // bcc, not to: - so students missing the same assignment do not see each
  // other's email addresses. A mailto: link opens the teacher's own mail
  // client with a draft; it does not send anything itself, and the teacher
  // reviews and sends it themselves.
  const reminderHref =
    missingEmails.length > 0
      ? `mailto:?bcc=${encodeURIComponent(missingEmails.join(","))}&subject=${encodeURIComponent(
          `Missing: ${title}`
        )}&body=${encodeURIComponent(
          `Hi,\n\nOur records show you haven't turned in "${title}" yet. Please submit it when you can.\n\nThanks!`
        )}`
      : null;

  // Tab-separated so it lands in one column per field if pasted into a
  // spreadsheet, and reads cleanly if pasted anywhere else.
  const copyAll = () => {
    const text = rows.map((r) => `${r.name}\t${r.score ?? ""}`).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Grades — {title}</DialogTitle>
          <DialogDescription>
            {gradedCount} of {rows.length} have a score
            {maxPoints != null ? ` (out of ${maxPoints})` : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Sort by</span>
          <div className="flex items-center gap-1 border rounded-lg p-1 bg-slate-50">
            {[
              { id: "last", label: "Last name" },
              { id: "first", label: "First name" },
            ].map((o) => (
              <button
                key={o.id}
                onClick={() => setSortBy(o.id)}
                className={`text-sm px-3 py-1 rounded-md transition-colors ${
                  sortBy === o.id
                    ? "bg-white shadow-sm font-medium text-slate-900"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {reminderHref && (
            <Button variant="outline" size="sm" asChild>
              <a href={reminderHref}>
                <Mail className="w-4 h-4 mr-1.5" />
                Email {missingEmails.length} missing student{missingEmails.length === 1 ? "" : "s"}
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={copyAll} className={reminderHref ? "" : "ml-auto"}>
            {copied ? <Check className="w-4 h-4 mr-1.5 text-emerald-600" /> : <Copy className="w-4 h-4 mr-1.5" />}
            {copied ? "Copied" : "Copy all"}
          </Button>
        </div>

        {loadingRoster && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Checking the roster for anyone missing...
          </p>
        )}

        <div className="border rounded-lg divide-y">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">Nobody has turned this in yet.</p>
          ) : (
            rows.map((r) => (
              <div key={r.key} className="flex items-center gap-3 px-4 py-2">
                <span className={`flex-1 truncate ${r.turnedIn ? "" : "text-muted-foreground"}`}>
                  {r.name}
                </span>
                {!r.turnedIn && (
                  <Badge variant="outline" className="text-slate-500 flex-shrink-0">
                    Not turned in
                  </Badge>
                )}
                <span
                  className={`w-24 text-right font-medium tabular-nums flex-shrink-0 ${
                    r.score == null ? "text-muted-foreground font-normal" : ""
                  }`}
                >
                  {r.score == null ? "—" : maxPoints != null ? `${r.score} / ${maxPoints}` : r.score}
                </span>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
