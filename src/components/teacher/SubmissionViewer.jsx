import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { FileDown, Clock, User, Trash2, ArrowUpDown, GraduationCap, BookOpen, KeyRound, ExternalLink, ZoomIn, Save, CheckCircle2, Clipboard, ClipboardCheck, ChevronLeft, ChevronRight, Copy, Check, Link2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function SubmissionViewer({ assignment }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState("review"); // "review" | "grade"
  const [sortOrder, setSortOrder] = useState("newest");
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [questionScores, setQuestionScores] = useState({}); // { [questionId]: string }
  const [partComments, setPartComments] = useState({}); // { [key]: string }

  const updateQuestionScore = (qId, value) => {
    setQuestionScores((prev) => ({ ...prev, [qId]: value }));
    setSaved(false);
  };

  const totalScore = Object.values(questionScores).reduce((sum, v) => {
    const n = parseFloat(v);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text || "");
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const updatePartComment = (key, value) => {
    setPartComments((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  useEffect(() => {
    loadSubmissions();
  }, [assignment.id]);

  const loadSubmissions = async () => {
    const results = await base44.entities.Submission.filter(
      { assignment_id: assignment.id, submitted: true },
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

  const openSubmission = (s, initialMode, index) => {
    setSelected(s);
    setSelectedIndex(index ?? sortedSubmissions.findIndex((x) => x.id === s.id));
    setMode(initialMode);
    setQuestionScores(
      Object.fromEntries(
        Object.entries(s.question_scores || {}).map(([k, v]) => [k, String(v)])
      )
    );
    setPartComments(s.part_comments || {});
    setSaved(false);
  };

  const navigateStudent = (direction) => {
    const newIndex = selectedIndex + direction;
    if (newIndex < 0 || newIndex >= sortedSubmissions.length) return;
    openSubmission(sortedSubmissions[newIndex], mode, newIndex);
  };

  const handleSaveGrade = async () => {
    setSaving(true);
    const parsedQuestionScores = Object.fromEntries(
      Object.entries(questionScores)
        .map(([k, v]) => [k, parseFloat(v)])
        .filter(([, v]) => !isNaN(v))
    );
    const hasScores = Object.keys(parsedQuestionScores).length > 0;
    const computedTotal = hasScores
      ? Object.values(parsedQuestionScores).reduce((s, v) => s + v, 0)
      : null;
    await base44.entities.Submission.update(selected.id, {
      score: computedTotal,
      question_scores: parsedQuestionScores,
      part_comments: partComments,
    });
    setSubmissions((prev) =>
      prev.map((s) =>
        s.id === selected.id
          ? { ...s, score: computedTotal, question_scores: parsedQuestionScores, part_comments: partComments }
          : s
      )
    );
    setSaving(false);
    setSaved(true);
  };

  const handleDelete = async () => {
    await base44.entities.Submission.delete(deleteTarget.id);
    setSubmissions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const formatDuration = (secs) => {
    if (!secs) return "—";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  const exportCSV = () => {
    const headers = ["Student Name", "Submitted At", "Time Spent"];
    const allKeys = new Set();
    submissions.forEach((s) => {
      Object.keys(s.responses || {}).forEach((k) => allKeys.add(k));
    });
    const responseKeys = Array.from(allKeys);
    headers.push(...responseKeys);
    const rows = submissions.map((s) => [
      s.student_name,
      s.submitted_at ? format(new Date(s.submitted_at), "yyyy-MM-dd HH:mm") : "",
      formatDuration(s.time_spent_seconds),
      ...responseKeys.map((k) => `"${(s.responses?.[k] || "").replace(/"/g, '""')}"`),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${assignment.title}_submissions.csv`;
    a.click();
  };

  // Build matched sections from assignment questions + responses
  const buildSections = (responses) => {
    const matched = new Set();
    const sections = (assignment.questions || []).map((q, qi) => {
      const parts = q.parts && q.parts.length > 0 ? q.parts : null;
      const items = parts
        ? parts.map((p) => {
            const key = `${q.id}_${p.id}`;
            matched.add(key);
            return {
              label: `Part (${p.label})`,
              key,
              text: responses[key],
              keyHtml: p.answer_key_html,
              keyImageUrl: p.answer_key_image_url,
            };
          })
        : [{
            label: null,
            key: q.id,
            text: responses[q.id],
            keyHtml: q.answer_key_html,
            keyImageUrl: q.answer_key_image_url,
          }];
      if (!parts) matched.add(q.id);
      return { title: q.title || `Question ${qi + 1}`, items };
    });

    const responseKeys = Object.keys(responses);
    const unmatched = responseKeys.filter((k) => !matched.has(k));
    if (unmatched.length > 0) {
      sections.push({
        title: "Other Responses",
        items: unmatched.map((k) => ({ label: k, key: k, text: responses[k], keyHtml: null, keyImageUrl: null })),
      });
    }
    return sections;
  };

  const hasAnyKey = (assignment.questions || []).some(
    (q) => q.answer_key_html || q.answer_key_image_url ||
      (q.parts || []).some((p) => p.answer_key_html || p.answer_key_image_url)
  );

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading submissions...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">
          {submissions.length} Submission{submissions.length !== 1 ? "s" : ""}
        </h3>
        {submissions.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder((o) => (o === "newest" ? "oldest" : "newest"))}
            >
              <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
              {sortOrder === "newest" ? "Newest First" : "Oldest First"}
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <FileDown className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </div>
        )}
      </div>

      {submissions.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">No submissions yet.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Time Spent</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Access Code</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSubmissions.map((s, i) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.student_name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {s.submitted_at ? format(new Date(s.submitted_at), "MMM d, yyyy h:mm a") : "—"}
                </TableCell>
                <TableCell className="text-sm">{formatDuration(s.time_spent_seconds)}</TableCell>
                <TableCell className="text-sm font-medium">
                  {s.score != null ? <span className="text-green-700">{s.score} pts</span> : <span className="text-muted-foreground">—</span>}
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
                    <Button variant="ghost" size="sm" onClick={() => openSubmission(s, "review", i)}>
                      <BookOpen className="w-4 h-4 mr-1" /> Review
                    </Button>
                    {hasAnyKey && (
                      <Button variant="ghost" size="sm" className="text-amber-600 hover:text-amber-800" onClick={() => openSubmission(s, "grade", i)}>
                        <GraduationCap className="w-4 h-4 mr-1" /> Grade
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => setDeleteTarget(s)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
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
          {selected && (() => {
            const sections = buildSections(selected.responses || {});
            return (
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
                        <button
                          onClick={() => { const url = `${window.location.origin}/my-score?code=${selected.access_code}`; navigator.clipboard.writeText(url); setCopiedCode(`modal-link-${selected.id}`); setTimeout(() => setCopiedCode(null), 2000); }}
                          className="text-slate-400 hover:text-blue-600 transition-colors"
                          title="Copy link with code pre-filled"
                        >
                          {copiedCode === `modal-link-${selected.id}` ? <Check className="w-4 h-4 text-green-500" /> : <Link2 className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                  </DialogTitle>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {selected.submitted_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {format(new Date(selected.submitted_at), "MMM d, yyyy h:mm a")}
                      </span>
                    )}
                    <span>Time: {formatDuration(selected.time_spent_seconds)}</span>
                  </div>
                </DialogHeader>

                {/* Student navigation bar */}
                <div className="flex items-center gap-3 py-2 border-b border-slate-100">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedIndex <= 0}
                    onClick={() => navigateStudent(-1)}
                    title="Previous student"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                  </Button>
                  <span className="text-sm text-muted-foreground flex-1 text-center">
                    Student {selectedIndex + 1} of {sortedSubmissions.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedIndex >= sortedSubmissions.length - 1}
                    onClick={() => navigateStudent(1)}
                    title="Next student"
                  >
                    Next <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>

                {/* Answer key link banner */}
                {assignment.answer_key_url && (
                  <a
                    href={assignment.answer_key_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 mt-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    <KeyRound className="w-4 h-4 flex-shrink-0" />
                    <span className="font-medium">Open Full Answer Key</span>
                    <ExternalLink className="w-3.5 h-3.5 ml-auto flex-shrink-0" />
                  </a>
                )}

                {/* Mode toggle */}
                {hasAnyKey && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setMode("review")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        mode === "review"
                          ? "bg-slate-800 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <BookOpen className="w-4 h-4" /> Review
                    </button>
                    <button
                      onClick={() => setMode("grade")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        mode === "grade"
                          ? "bg-amber-600 text-white"
                          : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                      }`}
                    >
                      <GraduationCap className="w-4 h-4" /> Grade (with key)
                    </button>
                  </div>
                )}

                {/* Score row */}
                <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-3 flex-wrap">
                  <label className="text-sm text-slate-600 whitespace-nowrap font-medium">Total Score:</label>
                  <span className="text-lg font-bold text-slate-800">
                    {Object.keys(questionScores).length > 0 ? totalScore : "—"}
                  </span>
                  {Object.keys(questionScores).length > 0 && (
                    <span className="text-sm text-slate-400">(sum of question scores)</span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <Button size="sm" onClick={handleSaveGrade} disabled={saving}>
                      <Save className="w-3.5 h-3.5 mr-1" />
                      {saving ? "Saving..." : "Save Grade"}
                    </Button>
                    {saved && (
                      <span className="flex items-center gap-1 text-sm text-green-600">
                        <CheckCircle2 className="w-4 h-4" /> Saved
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-6 mt-2">
                  {sections.map((section, si) => {
                    const qId = (assignment.questions || [])[si]?.id;
                    return (
                    <div key={si}>
                      <div className="flex items-center gap-3 mb-3">
                        <h4 className="font-semibold text-sm text-slate-700">{section.title}</h4>
                        {mode === "grade" && qId && (() => {
                          const qDef = (assignment.questions || [])[si];
                          const maxScore = qDef?.max_score ?? 9;
                          return (
                            <div className="flex items-center gap-1.5 ml-2">
                              <label className="text-xs text-slate-500 whitespace-nowrap">Score:</label>
                              <input
                                type="number"
                                min="0"
                                max={maxScore}
                                step="0.5"
                                value={questionScores[qId] || ""}
                                onChange={(e) => updateQuestionScore(qId, e.target.value)}
                                className="w-16 border border-slate-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
                                placeholder={`0–${maxScore}`}
                              />
                              <span className="text-xs text-slate-400">/ {maxScore}</span>
                              <button
                                onClick={() => updateQuestionScore(qId, String(maxScore))}
                                className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors font-medium whitespace-nowrap"
                                title={`Give full credit (${maxScore})`}
                              >
                                Full credit
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                      {section.items.map(({ label, key, text, keyHtml, keyImageUrl }) => (
                        <div key={key} className="mb-4 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                          {label && <Badge variant="outline" className="mb-2">{label}</Badge>}

                          {mode === "grade" && (keyHtml || keyImageUrl) ? (
                            /* Grade mode: three columns */
                            <div className="grid gap-3 pr-3" style={{ gridTemplateColumns: "45% 30% 25%" }}>
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Student Answer</p>
                                  <button
                                    onClick={() => copyToClipboard(text, key)}
                                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                                    title="Copy student answer"
                                  >
                                    {copiedKey === key ? <ClipboardCheck className="w-3.5 h-3.5 text-green-500" /> : <Clipboard className="w-3.5 h-3.5" />}
                                    {copiedKey === key ? "Copied!" : "Copy"}
                                  </button>
                                </div>
                                <pre className="bg-slate-50 border rounded-lg p-4 text-sm font-mono whitespace-pre-wrap overflow-x-auto h-full">
                                  {text || "(no response)"}
                                </pre>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1 flex items-center gap-1">
                                  <KeyRound className="w-3 h-3" /> Answer Key
                                </p>
                                <div className="border border-amber-200 rounded-lg bg-amber-50/40 p-4 text-sm">
                                  {keyHtml && (
                                    <div
                                      className="prose prose-sm max-w-none quill-render"
                                      dangerouslySetInnerHTML={{ __html: keyHtml }}
                                    />
                                  )}
                                  {keyImageUrl && (
                                    <button onClick={() => setLightboxUrl(keyImageUrl)} className="mt-2 block group relative">
                                      <img src={keyImageUrl} alt="Answer key" className="max-w-full rounded border group-hover:opacity-90 transition-opacity" />
                                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="bg-black/50 rounded-full p-2">
                                          <ZoomIn className="w-5 h-5 text-white" />
                                        </div>
                                      </div>
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Comments</p>
                                <Textarea
                                  value={partComments[key] || ""}
                                  onChange={(e) => updatePartComment(key, e.target.value)}
                                  placeholder="Feedback for this part..."
                                  rows={5}
                                  className="text-sm w-full"
                                />
                              </div>
                            </div>
                          ) : (
                            /* Review mode: just student answer */
                            <pre className="bg-slate-50 border rounded-lg p-4 text-sm font-mono whitespace-pre-wrap overflow-x-auto">
                              {text || "(no response)"}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
      {/* Image lightbox as a separate Dialog */}
      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex items-center justify-center bg-black/90 border-none p-2">
          <img
            src={lightboxUrl || ""}
            alt="Answer key full size"
            className="max-w-full max-h-[85vh] rounded shadow-2xl object-contain"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}