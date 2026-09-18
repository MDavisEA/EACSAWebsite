import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
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
      <div className="border rounded-lg divide-y">
        {sorted.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="flex-1 min-w-0 truncate font-medium">{r.student_name}</span>
            <Badge variant={r.submitted ? "default" : "secondary"} className="flex-shrink-0">
              {r.submitted ? "Complete" : "In progress"}
            </Badge>
            <span className="text-xs text-muted-foreground flex-shrink-0 w-20 text-right">
              {r.loop_score ?? 0} / {target}
            </span>
            <span className="text-xs text-muted-foreground flex-shrink-0 w-24 text-right">
              <span className="text-emerald-600">{r.loop_correct_count ?? 0} right</span>
              {" · "}
              <span className="text-rose-500">{r.loop_wrong_count ?? 0} wrong</span>
            </span>
            <span className="text-xs text-muted-foreground flex-shrink-0 w-24 text-right">
              {r.updated_at ? format(new Date(r.updated_at), "MMM d, h:mm a") : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
