import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import CommentBank from "./CommentBank";
import {
  ChevronLeft, ChevronRight, KeyRound, Save, CheckCircle2, Clipboard, ClipboardCheck, ZoomIn,
} from "lucide-react";

// Same rubric, thirty times in a row, is a different kind of work than one
// student's whole exam - grading one question across everybody lets the
// teacher hold a single standard in their head instead of re-reading the
// whole rubric for every student. This is the alternative to the per-student
// flow in SubmissionViewer, not a replacement for it - either can be used.
//
// The saved shape is unchanged: each submission still gets one full
// question_scores/part_comments object, exactly like the per-student editor
// writes. This component just changes the order things are visited in and
// autosaves on every move, since firing through many small edits is the
// whole point and a teacher should never have to remember to click Save
// between students.
function buildQuestionItems(question, responses) {
  const parts = question.parts && question.parts.length > 0 ? question.parts : null;
  if (!parts) {
    return [{
      label: null,
      key: question.id,
      text: responses[question.id],
      keyHtml: question.answer_key_html,
      keyImageUrl: question.answer_key_image_url,
    }];
  }
  return parts.map((p) => ({
    label: `Part (${p.label})`,
    key: `${question.id}_${p.id}`,
    text: responses[`${question.id}_${p.id}`],
    keyHtml: p.answer_key_html,
    keyImageUrl: p.answer_key_image_url,
  }));
}

export default function ByQuestionGrader({ open, onOpenChange, assignment, submissions, onSubmissionUpdated }) {
  const questions = assignment.questions || [];
  const [qIndex, setQIndex] = useState(0);
  const [studentIndex, setStudentIndex] = useState(0);
  const [grades, setGrades] = useState({}); // { [submissionId]: { questionScores, partComments } }
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [copiedKey, setCopiedKey] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  // Re-seed from the latest submissions every time this opens, so grades
  // entered in the per-student view are reflected here too.
  useEffect(() => {
    if (!open) return;
    const seeded = {};
    submissions.forEach((s) => {
      seeded[s.id] = {
        questionScores: Object.fromEntries(
          Object.entries(s.question_scores || {}).map(([k, v]) => [k, String(v)])
        ),
        partComments: { ...(s.part_comments || {}) },
      };
    });
    setGrades(seeded);
    setQIndex(0);
    setStudentIndex(0);
    setSaved(false);
  }, [open]);

  const question = questions[qIndex];
  const student = submissions[studentIndex];
  const maxScore = question?.max_score ?? 9;

  const gradedCount = question
    ? submissions.filter((s) => grades[s.id]?.questionScores?.[question.id] !== undefined && grades[s.id]?.questionScores?.[question.id] !== "").length
    : 0;

  const updateScore = (value) => {
    setGrades((prev) => ({
      ...prev,
      [student.id]: { ...prev[student.id], questionScores: { ...prev[student.id]?.questionScores, [question.id]: value } },
    }));
    setSaved(false);
    setSaveError("");
  };

  const updateComment = (key, value) => {
    setGrades((prev) => ({
      ...prev,
      [student.id]: { ...prev[student.id], partComments: { ...prev[student.id]?.partComments, [key]: value } },
    }));
    setSaved(false);
  };

  // Persists the FULL grades object for one submission, same shape the
  // per-student editor saves - so grading one question here never wipes out
  // scores another question already has for this student.
  // Returns whether it actually succeeded. Every caller is a navigation
  // action - Next Student, Next Question, closing the dialog - and none of
  // them may proceed on a failure, or a network blip would silently discard
  // the score the teacher just typed and they would have no way to know.
  const persist = async (submissionId) => {
    const g = grades[submissionId];
    if (!g) return true;
    const parsedScores = Object.fromEntries(
      Object.entries(g.questionScores)
        .map(([k, v]) => [k, parseFloat(v)])
        .filter(([, v]) => !isNaN(v))
    );
    const hasScores = Object.keys(parsedScores).length > 0;
    const total = hasScores ? Object.values(parsedScores).reduce((s, v) => s + v, 0) : null;
    try {
      await base44.entities.Submission.update(submissionId, {
        score: total,
        question_scores: parsedScores,
        part_comments: g.partComments,
      });
      onSubmissionUpdated(submissionId, { score: total, question_scores: parsedScores, part_comments: g.partComments });
      setSaveError("");
      return true;
    } catch (e) {
      setSaveError(e.message || "Couldn't save that grade. Your entry is still here — try again.");
      return false;
    }
  };

  const goStudent = async (delta) => {
    const next = studentIndex + delta;
    if (next < 0 || next >= submissions.length) return;
    setSaving(true);
    const ok = await persist(student.id);
    setSaving(false);
    if (!ok) return;
    setSaved(true);
    setStudentIndex(next);
  };

  const jumpToStudent = async (index) => {
    if (index === studentIndex) return;
    setSaving(true);
    const ok = await persist(student.id);
    setSaving(false);
    if (!ok) return;
    setSaved(true);
    setStudentIndex(index);
  };

  const goQuestion = async (delta) => {
    const next = qIndex + delta;
    if (next < 0 || next >= questions.length) return;
    setSaving(true);
    const ok = await persist(student.id);
    setSaving(false);
    if (!ok) return;
    setSaved(true);
    setQIndex(next);
    setStudentIndex(0);
  };

  const handleClose = async () => {
    if (student) {
      const ok = await persist(student.id);
      if (!ok) {
        const proceed = window.confirm(
          "The last grade could not be saved. Close anyway and lose it?"
        );
        if (!proceed) return;
      }
    }
    onOpenChange(false);
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text || "");
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!question || !student) return null;
  const items = buildQuestionItems(question, student.responses || {});

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="max-w-[96vw] w-[96vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Grade by Question — {assignment.title}</DialogTitle>
        </DialogHeader>

        {/* Question navigation */}
        <div className="flex items-center gap-3 py-2 border-b border-slate-100">
          <Button variant="outline" size="sm" disabled={qIndex <= 0} onClick={() => goQuestion(-1)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous Question
          </Button>
          <span className="text-sm font-medium flex-1 text-center">
            Question {qIndex + 1} of {questions.length}: {question.title}
            <span className="text-muted-foreground font-normal ml-2">
              ({gradedCount}/{submissions.length} graded)
            </span>
          </span>
          <Button variant="outline" size="sm" disabled={qIndex >= questions.length - 1} onClick={() => goQuestion(1)}>
            Next Question <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        {/* Student progress strip - click any dot to jump straight there */}
        <div className="flex items-center gap-1 flex-wrap py-2">
          {submissions.map((s, i) => {
            const isGraded = grades[s.id]?.questionScores?.[question.id] !== undefined && grades[s.id]?.questionScores?.[question.id] !== "";
            return (
              <button
                key={s.id}
                onClick={() => jumpToStudent(i)}
                title={s.student_name}
                className={`w-7 h-7 rounded text-xs font-medium flex items-center justify-center transition-colors ${
                  i === studentIndex
                    ? "bg-slate-800 text-white"
                    : isGraded
                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {/* Student navigation */}
        <div className="flex items-center gap-3 py-2 border-b border-slate-100">
          <Button variant="outline" size="sm" disabled={studentIndex <= 0} onClick={() => goStudent(-1)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous Student
          </Button>
          <span className="text-sm text-muted-foreground flex-1 text-center">
            {student.student_name} — Student {studentIndex + 1} of {submissions.length}
          </span>
          <Button variant="outline" size="sm" disabled={studentIndex >= submissions.length - 1} onClick={() => goStudent(1)}>
            Next Student <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        {assignment.answer_key_url && (
          <a
            href={assignment.answer_key_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 mt-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 hover:bg-amber-100 transition-colors"
          >
            <KeyRound className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">Open Full Answer Key</span>
          </a>
        )}

        {/* Score row for the current question */}
        <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-3 flex-wrap">
          <label className="text-sm text-slate-600 whitespace-nowrap font-medium">Score:</label>
          <input
            type="number"
            min="0"
            max={maxScore}
            step="0.5"
            value={grades[student.id]?.questionScores?.[question.id] ?? ""}
            onChange={(e) => updateScore(e.target.value)}
            className="w-20 border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
            placeholder={`0–${maxScore}`}
            autoFocus
          />
          <span className="text-sm text-slate-400">/ {maxScore}</span>
          <button
            onClick={() => updateScore(String(maxScore))}
            className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors font-medium"
          >
            Full credit
          </button>
          <button
            onClick={() => updateScore("0")}
            className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-medium"
          >
            Zero
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" onClick={async () => { setSaving(true); await persist(student.id); setSaving(false); setSaved(true); }} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1" />
              {saving ? "Saving..." : "Save"}
            </Button>
            {saved && !saving && !saveError && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="w-4 h-4" /> Saved
              </span>
            )}
          </div>
        </div>
        {saveError && (
          <p className="text-sm text-destructive px-1">{saveError}</p>
        )}

        {/* The answer(s) for this question, side by side with the key */}
        <div className="space-y-4 mt-3">
          {items.map(({ label, key, text, keyHtml, keyImageUrl }) => (
            <div key={key}>
              {label && <Badge variant="outline" className="mb-2">{label}</Badge>}
              <div className="grid gap-3 pr-3" style={{ gridTemplateColumns: "45% 30% 25%" }}>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Student Answer</p>
                    <button
                      onClick={() => copyToClipboard(text, key)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
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
                  <div className="border border-amber-200 rounded-lg bg-amber-50/40 p-4 text-sm min-h-[60px]">
                    {keyHtml && (
                      <div className="prose prose-sm max-w-none quill-render" dangerouslySetInnerHTML={{ __html: keyHtml }} />
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
                    {!keyHtml && !keyImageUrl && (
                      <p className="text-muted-foreground text-xs">No answer key set for this part.</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Comments</p>
                  <Textarea
                    value={grades[student.id]?.partComments?.[key] || ""}
                    onChange={(e) => updateComment(key, e.target.value)}
                    placeholder="Feedback for this part..."
                    rows={5}
                    className="text-sm w-full"
                  />
                  <div className="mt-1.5">
                    <CommentBank compact value={grades[student.id]?.partComments?.[key] || ""} onChange={(next) => updateComment(key, next)} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>

      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex items-center justify-center bg-black/90 border-none p-2">
          <img src={lightboxUrl || ""} alt="Answer key full size" className="max-w-full max-h-[85vh] rounded shadow-2xl object-contain" />
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
