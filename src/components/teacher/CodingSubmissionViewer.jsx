import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FileDown, Clock, User, Trash2, ArrowUpDown, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Copy, Check, Link2, CheckCircle2, XCircle, EyeOff, AlertTriangle } from "lucide-react";

// Derived from a submission's run_history (one entry per Run/Submit click,
// each carrying a full code snapshot, compile status, and per-check
// results) - not stored separately, since everything here falls out of
// that one array.
function computeAttemptStats(submission) {
  const history = submission.run_history || [];
  const totalAttempts = history.length;
  const firstFullPassIdx = history.findIndex((h) => h.tests_total > 0 && h.tests_passed === h.tests_total);
  const compileErrorCount = history.filter((h) => h.compile_error).length;
  return {
    totalAttempts,
    attemptsToFirstPass: firstFullPassIdx === -1 ? null : firstFullPassIdx + 1,
    compileErrorCount,
  };
}

export default function CodingSubmissionViewer({ problem }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [sortOrder, setSortOrder] = useState("newest");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [expandedAttempt, setExpandedAttempt] = useState(null);

  useEffect(() => {
    loadSubmissions();
  }, [problem.id]);

  const loadSubmissions = async () => {
    const results = await base44.entities.Submission.filter(
      { coding_problem_id: problem.id, submitted: true },
      "-submitted_at"
    );
    setSubmissions(results);
    setLoading(false);
  };

  const sortedSubmissions = [...submissions].sort((a, b) => {
    const aTime = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
    const bTime = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
    return sortOrder === "newest" ? bTime - aTime : aTime - bTime;
  });

  const openSubmission = (s, index) => {
    setSelected(s);
    setSelectedIndex(index ?? sortedSubmissions.findIndex((x) => x.id === s.id));
    setExpandedAttempt(null);
  };

  const navigateStudent = (direction) => {
    const newIndex = selectedIndex + direction;
    if (newIndex < 0 || newIndex >= sortedSubmissions.length) return;
    openSubmission(sortedSubmissions[newIndex], newIndex);
  };

  const handleDelete = async () => {
    await base44.entities.Submission.delete(deleteTarget.id);
    setSubmissions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const exportCSV = () => {
    const headers = ["Student Name", "Submitted At", "Score", "Points Possible", "Checks Passed", "Attempts", "Solved On Attempt", "Compile Errors"];
    const rows = submissions.map((s) => {
      const passed = (s.test_results || []).filter((r) => r.passed).length;
      const total = (s.test_results || []).length;
      const stats = computeAttemptStats(s);
      return [
        s.student_name,
        s.submitted_at ? format(new Date(s.submitted_at), "yyyy-MM-dd HH:mm") : "",
        s.autograde_score ?? "",
        problem.points_possible ?? "",
        `${passed}/${total}`,
        stats.totalAttempts,
        stats.attemptsToFirstPass ?? "never",
        stats.compileErrorCount,
      ];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${problem.title}_submissions.csv`;
    a.click();
  };

  // Class-wide signal: across every submitted student's latest results,
  // which specific checks trip up the most people? Sorted worst-first so
  // the most useful reteach target surfaces immediately.
  const checkStats = (() => {
    const byCheck = {};
    submissions.forEach((s) => {
      (s.test_results || []).forEach((r) => {
        const key = `${r.method_name}::${r.test_id}`;
        if (!byCheck[key]) byCheck[key] = { method_name: r.method_name, label: r.label, hidden: r.hidden, passed: 0, total: 0 };
        byCheck[key].total += 1;
        if (r.passed) byCheck[key].passed += 1;
      });
    });
    return Object.values(byCheck)
      .map((c) => ({ ...c, passRate: c.total > 0 ? c.passed / c.total : 0 }))
      .sort((a, b) => a.passRate - b.passRate);
  })();

  const avgAttempts =
    submissions.length > 0
      ? submissions.reduce((sum, s) => sum + (s.run_history?.length || 0), 0) / submissions.length
      : 0;
  const compileErrorRate =
    submissions.length > 0
      ? submissions.filter((s) => (s.run_history || []).some((h) => h.compile_error)).length / submissions.length
      : 0;

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading submissions...</div>;
  }

  const selectedStats = selected ? computeAttemptStats(selected) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">
          {submissions.length} Submission{submissions.length !== 1 ? "s" : ""}
        </h3>
        {submissions.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSortOrder((o) => (o === "newest" ? "oldest" : "newest"))}>
              <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
              {sortOrder === "newest" ? "Newest First" : "Oldest First"}
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <FileDown className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </div>
        )}
      </div>

      {submissions.length > 0 && (
        <div className="mb-4 p-4 bg-slate-50 border rounded-lg">
          <p className="text-sm font-semibold mb-2">Class Insights</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
            <span>Avg. {avgAttempts.toFixed(1)} attempts per student</span>
            <span>{Math.round(compileErrorRate * 100)}% hit a compile error at some point</span>
          </div>
          {checkStats.length > 0 && (
            <>
              <p className="text-xs font-medium text-slate-600 mb-1.5">Hardest checks (lowest class pass rate)</p>
              <div className="space-y-1.5">
                {checkStats.slice(0, 6).map((c) => (
                  <div key={`${c.method_name}::${c.label}`} className="flex items-center gap-2 text-xs">
                    <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden max-w-[160px]">
                      <div
                        className={`h-full ${c.passRate < 0.5 ? "bg-red-400" : c.passRate < 0.8 ? "bg-amber-400" : "bg-emerald-500"}`}
                        style={{ width: `${Math.round(c.passRate * 100)}%` }}
                      />
                    </div>
                    <span className="w-9 text-right text-slate-500">{Math.round(c.passRate * 100)}%</span>
                    <span className="text-slate-600 truncate flex-1">
                      <span className="font-mono">{c.method_name}()</span>: {c.label}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {submissions.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">No submissions yet.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Access Code</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSubmissions.map((s, i) => {
              const stats = computeAttemptStats(s);
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.student_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.submitted_at ? format(new Date(s.submitted_at), "MMM d, yyyy h:mm a") : "—"}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {s.autograde_score != null ? (
                      <span className="text-green-700">{s.autograde_score} / {problem.points_possible ?? 0} pts</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      {stats.totalAttempts}
                      {stats.compileErrorCount > 0 && (
                        <AlertTriangle className="w-3 h-3 text-amber-500" title={`${stats.compileErrorCount} compile error(s)`} />
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    {s.access_code ? (
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-slate-100 px-2 py-0.5 rounded font-mono">{s.access_code}</code>
                        <button
                          onClick={() => { navigator.clipboard.writeText(s.access_code); setCopiedCode(s.id); setTimeout(() => setCopiedCode(null), 2000); }}
                          className="text-slate-400 hover:text-slate-600 transition-colors"
                          title="Copy code only"
                        >
                          {copiedCode === s.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/my-score?code=${s.access_code}`;
                            navigator.clipboard.writeText(url);
                            setCopiedCode(`link-${s.id}`);
                            setTimeout(() => setCopiedCode(null), 2000);
                          }}
                          className="text-slate-400 hover:text-blue-600 transition-colors"
                          title="Copy link with code pre-filled"
                        >
                          {copiedCode === `link-${s.id}` ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Link2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openSubmission(s, i)}>
                        Review
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => setDeleteTarget(s)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
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
              This will permanently delete {deleteTarget?.student_name}'s submission. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-[96vw] w-[96vw] max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <User className="w-5 h-5 flex-shrink-0" />
                  <span className="flex-1">{selected.student_name}</span>
                  {selected.access_code && (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <code className="text-xs bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-600">{selected.access_code}</code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(selected.access_code); setCopiedCode(`modal-${selected.id}`); setTimeout(() => setCopiedCode(null), 2000); }}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                        title="Copy code only"
                      >
                        {copiedCode === `modal-${selected.id}` ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </DialogTitle>
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  {selected.submitted_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {format(new Date(selected.submitted_at), "MMM d, yyyy h:mm a")}
                    </span>
                  )}
                  <span>
                    Score: {selected.autograde_score != null ? `${selected.autograde_score} / ${problem.points_possible ?? 0} pts` : "—"}
                  </span>
                  <span>{selectedStats.totalAttempts} attempt{selectedStats.totalAttempts !== 1 ? "s" : ""}</span>
                  <span>
                    {selectedStats.attemptsToFirstPass
                      ? `Solved on attempt ${selectedStats.attemptsToFirstPass}`
                      : "Never fully passed"}
                  </span>
                  {selectedStats.compileErrorCount > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {selectedStats.compileErrorCount} compile error{selectedStats.compileErrorCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </DialogHeader>

              <div className="flex items-center gap-3 py-2 border-b border-slate-100">
                <Button variant="outline" size="sm" disabled={selectedIndex <= 0} onClick={() => navigateStudent(-1)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                </Button>
                <span className="text-sm text-muted-foreground flex-1 text-center">
                  Student {selectedIndex + 1} of {sortedSubmissions.length}
                </span>
                <Button variant="outline" size="sm" disabled={selectedIndex >= sortedSubmissions.length - 1} onClick={() => navigateStudent(1)}>
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Final Submitted Code</p>
                  <pre className="bg-slate-50 border rounded-lg p-4 text-sm font-mono whitespace-pre-wrap overflow-x-auto max-h-[50vh]">
                    {selected.code || "(no code)"}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Final Checks</p>
                  {selected.compile_error ? (
                    <div className="border border-destructive/30 bg-red-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-destructive mb-1">Compile Error</p>
                      <pre className="text-xs text-destructive whitespace-pre-wrap font-mono">{selected.compile_error}</pre>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                      {Object.entries(
                        (selected.test_results || []).reduce((acc, r) => {
                          const key = r.method_name || "";
                          (acc[key] = acc[key] || []).push(r);
                          return acc;
                        }, {})
                      ).map(([methodName, rs]) => (
                        <div key={methodName} className="space-y-2">
                          {methodName && (
                            <p className="text-xs font-mono font-semibold text-slate-500">{methodName}()</p>
                          )}
                          {rs.map((r) => (
                            <div key={r.test_id} className="flex items-start gap-2 text-sm border rounded-lg px-3 py-2 bg-slate-50/50">
                              {r.hidden ? (
                                <EyeOff className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                              ) : r.passed ? (
                                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                              )}
                              <div>
                                <p className={r.hidden ? "text-slate-400 italic" : "text-slate-700"}>{r.label}</p>
                                <p className="text-xs text-muted-foreground">{r.detail}</p>
                              </div>
                              <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">
                                {r.points_earned}/{r.points_possible} pt
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                      {(!selected.test_results || selected.test_results.length === 0) && (
                        <p className="text-sm text-muted-foreground">No test results recorded.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 border-t pt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Attempt History ({selectedStats.totalAttempts})
                </p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {(selected.run_history || []).map((h, i) => {
                    const fullyPassed = h.tests_total > 0 && h.tests_passed === h.tests_total;
                    const isExpanded = expandedAttempt === i;
                    return (
                      <div key={i} className="border rounded-lg overflow-hidden">
                        <button
                          onClick={() => setExpandedAttempt(isExpanded ? null : i)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors"
                        >
                          <span className="text-xs text-slate-400 w-8 flex-shrink-0">#{i + 1}</span>
                          {h.compile_error ? (
                            <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                          ) : fullyPassed ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          )}
                          <span className="text-slate-600">
                            {h.compile_error ? "Compile error" : `${h.tests_passed}/${h.tests_total} passed`}
                          </span>
                          {h.final && <Badge variant="outline" className="text-xs">Final</Badge>}
                          <span className="ml-auto text-xs text-slate-400 flex-shrink-0">
                            {h.timestamp ? format(new Date(h.timestamp), "MMM d, h:mm:ss a") : ""}
                          </span>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                        </button>
                        {isExpanded && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border-t bg-slate-50/50">
                            <pre className="bg-white border rounded p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-64">
                              {h.code || "(no code)"}
                            </pre>
                            <div className="space-y-1 overflow-y-auto max-h-64">
                              {h.compile_error ? (
                                <pre className="text-xs text-destructive whitespace-pre-wrap font-mono">{h.compile_error}</pre>
                              ) : (
                                (h.results || []).map((r) => (
                                  <div key={`${r.method_name}-${r.test_id}`} className="flex items-center gap-1.5 text-xs">
                                    {r.passed ? (
                                      <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0" />
                                    ) : (
                                      <XCircle className="w-3 h-3 text-destructive flex-shrink-0" />
                                    )}
                                    <span className="text-slate-600">
                                      <span className="font-mono">{r.method_name}()</span>: {r.label}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(!selected.run_history || selected.run_history.length === 0) && (
                    <p className="text-sm text-muted-foreground">No attempt history recorded.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
