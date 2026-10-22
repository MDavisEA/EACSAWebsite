import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Check, MessageSquarePlus, X } from "lucide-react";

// What a student typed for a sketch assignment's written questions, read-only, for the
// grader to read next to their code. With `onScore` each question gets quick marks - a check
// (full credit), a half, and an X (none) - beside a box for any other number, so an answer can
// be scored right where it is read. The same scores are in the score column. With `onComment`
// each answer can also get its own note to the student (released with the rest of the feedback).
export default function WrittenAnswers({ questions, answers, scores = {}, onScore, comments = {}, onComment }) {
  if (!questions || questions.length === 0) return null;
  const answered = questions.filter((q) => (answers?.[q.id] || "").trim()).length;
  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <div className="bg-slate-100 border-b px-3 py-1.5 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Written answers</span>
        <span className="text-xs text-muted-foreground">{answered} of {questions.length} answered</span>
      </div>
      <div className="divide-y max-h-[45vh] overflow-auto">
        {questions.map((q, i) => {
          const answer = answers?.[q.id];
          const score = scores[q.id];
          return (
            <div key={q.id} className="px-3 py-2.5 space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold">{i + 1}.</span>
                <div className="flex-1 min-w-0 text-sm markdown-render"><ReactMarkdown>{q.prompt}</ReactMarkdown></div>
                {onScore ? (
                  <QuickMarks question={q} score={score} onScore={(v) => onScore(q.id, v)} />
                ) : (
                  typeof q.points === "number" && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {score !== undefined && score !== "" ? `${score} / ` : ""}{q.points} pt{q.points === 1 ? "" : "s"}
                    </span>
                  )
                )}
              </div>
              {answer ? (
                <p className={`text-sm whitespace-pre-wrap rounded-md bg-slate-50 border px-3 py-2 ${q.code ? "font-mono text-[13px]" : ""}`}>
                  {answer}
                </p>
              ) : (
                <p className="text-sm text-amber-700 italic">No answer.</p>
              )}
              {onComment && <AnswerComment value={comments[q.id] || ""} onChange={(v) => onComment(q.id, v)} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Notes keyed by question id -> only real questions, only ones with something written. */
export function cleanComments(comments, questions) {
  const out = {};
  for (const q of questions || []) {
    const t = (comments?.[q.id] || "").trim();
    if (t) out[q.id] = t;
  }
  return out;
}

// Half of the points, in halves (5 -> 2.5, 3 -> 1.5, 1 -> 0.5).
const half = (points) => String(Math.round((points / 2) * 2) / 2);

function QuickMarks({ question, score, onScore }) {
  const pts = question.points;
  const has = typeof pts === "number";
  const cur = score === undefined || score === "" ? null : Number(score);
  const on = (v) => cur !== null && cur === Number(v);
  const btn = (active, tone) =>
    `h-7 min-w-7 px-1.5 rounded-md border text-xs font-medium inline-flex items-center justify-center transition-colors ${
      active ? tone : "bg-white text-slate-500 border-slate-300 hover:border-slate-400"
    }`;
  return (
    <span className="flex items-center gap-1 flex-shrink-0">
      {has && (
        <>
          <button type="button" onClick={() => onScore(String(pts))} title="Full credit" aria-label="Full credit"
            className={btn(on(pts), "bg-green-600 text-white border-green-600")}>
            <Check className="w-4 h-4" />
          </button>
          {pts >= 1 ? (
            <button type="button" onClick={() => onScore(half(pts))} title={`Half credit (${half(pts)})`} aria-label="Half credit"
              className={btn(on(half(pts)) && !on(pts) && !on(0), "bg-amber-500 text-white border-amber-500")}>
              &frac12;
            </button>
          ) : null}
          <button type="button" onClick={() => onScore("0")} title="No credit" aria-label="No credit"
            className={btn(on(0), "bg-red-600 text-white border-red-600")}>
            <X className="w-4 h-4" />
          </button>
        </>
      )}
      <input
        type="number"
        min="0"
        step="0.5"
        value={score ?? ""}
        onChange={(e) => onScore(e.target.value)}
        aria-label="Score"
        placeholder="—"
        className="h-7 w-14 rounded-md border border-slate-300 text-center text-sm"
      />
      {has && <span className="text-xs text-muted-foreground w-9">/ {pts}</span>}
    </span>
  );
}

// A note on one answer. Closed behind a small button until wanted, open once there is a note.
function AnswerComment({ value, onChange }) {
  const [open, setOpen] = useState(false);
  if (!open && !value) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
        <MessageSquarePlus className="w-3.5 h-3.5" /> Comment on this answer
      </button>
    );
  }
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoFocus={open && !value}
      rows={2}
      aria-label="Your comment on this answer"
      placeholder="What the student should see about this answer..."
      className="w-full rounded-md border border-amber-300 bg-amber-50/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
    />
  );
}
