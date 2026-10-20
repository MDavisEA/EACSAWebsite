import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

// Students who have started a Mini Problem but not turned it in, with a way to
// give one of them more practice runs if something goes wrong mid-quiz. The
// submitted-work list above never shows these students, so without this a
// teacher had nowhere to find someone who is stuck right now. The student
// sees the new allowance after refreshing their page (or on their next run).
export default function InProgressRuns({ problem }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      setRows(await base44.entities.Submission.listInProgress(problem.id));
    } catch (e) {
      setError(e.message || "Couldn't load students.");
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const adjust = async (row, opts) => {
    setBusyId(row.id);
    setError("");
    try {
      const res = await base44.entities.Submission.adjustTestRuns(row.id, opts);
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, extra_test_runs: res.extra_test_runs } : r)));
    } catch (e) {
      setError(e.message || "Couldn't update that student.");
    } finally {
      setBusyId(null);
    }
  };

  if (problem.max_test_runs == null) return null;

  return (
    <div className="border rounded-lg mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-left"
      >
        <span>Students still working &mdash; give extra test runs</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="border-t px-3 py-2 space-y-2">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {rows === null ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has started this and not turned it in.</p>
          ) : (
            rows.map((r) => {
              const allowed = (r.max_test_runs ?? 0) + r.extra_test_runs;
              const left = Math.max(0, allowed - r.runs_used);
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium min-w-[10rem]">{r.student_name}</span>
                  <span className="text-muted-foreground">
                    {r.runs_used} of {allowed} used
                    {r.extra_test_runs > 0 ? ` (+${r.extra_test_runs} given)` : ""} &middot; {left} left
                  </span>
                  <div className="flex items-center gap-1 ml-auto">
                    {[1, 2].map((n) => (
                      <Button key={n} size="sm" variant="outline" disabled={busyId === r.id} onClick={() => adjust(r, { delta: n })}>
                        +{n}
                      </Button>
                    ))}
                    <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => adjust(r, { reset: true })}>
                      Reset to {r.max_test_runs}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
        </div>
      )}
    </div>
  );
}
