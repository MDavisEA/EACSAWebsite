import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { byLastName } from "@/lib/groupSubmissionsByStudent";

// Read-only, unlike every other "View Submissions" list - there's nothing
// for a teacher to grade here, loop practice is self-graded, so this is
// purely "how is everyone doing." Shows everyone who has STARTED this set;
// a student who hasn't opened it yet has no submissions row at all, so
// they're simply absent from this list rather than shown as "not started"
// (no roster diff here yet, unlike Projects' "who hasn't turned in").
export default function LoopSubmissionViewer({ assignment }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    load();
  }, [assignment.id]);

  const load = async () => {
    setLoadError("");
    try {
      const results = await base44.entities.Submission.filterSummary({ loop_assignment_id: assignment.id });
      setRows(results);
    } catch (e) {
      setLoadError(e.message || "Couldn't load progress. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const sorted = [...rows].sort(byLastName);
  const target = Number(assignment.target_score ?? 0);

  if (loading) {
    return (
      <div className="py-6 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return <p className="text-sm text-destructive py-2">{loadError}</p>;
  }

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No one has started this practice set yet.</p>;
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {sorted.filter((r) => r.submitted).length} of {sorted.length} finished
      </p>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Correct</TableHead>
              <TableHead className="text-right">Wrong</TableHead>
              <TableHead className="text-right">Last Activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.student_name}</TableCell>
                <TableCell>
                  <Badge variant={r.submitted ? "default" : "secondary"}>
                    {r.submitted ? "Complete" : "In progress"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                  {r.loop_score ?? 0} / {target}
                </TableCell>
                <TableCell className="text-right text-emerald-600">{r.loop_correct_count ?? 0}</TableCell>
                <TableCell className="text-right text-rose-500">{r.loop_wrong_count ?? 0}</TableCell>
                <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                  {r.updated_at ? format(new Date(r.updated_at), "MMM d, h:mm a") : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
