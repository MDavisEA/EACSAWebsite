import React from "react";
import ReactMarkdown from "react-markdown";

// What a student typed for a sketch assignment's written questions, read-only, for the
// grader to read next to their code. Scoring them happens in the score column (they are
// scored per question, like programs); this only shows the answers.
export default function WrittenAnswers({ questions, answers, scores = {} }) {
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
                {typeof q.points === "number" && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {score !== undefined && score !== "" ? `${score} / ` : ""}{q.points} pt{q.points === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {answer ? (
                <p className={`text-sm whitespace-pre-wrap rounded-md bg-slate-50 border px-3 py-2 ${q.code ? "font-mono text-[13px]" : ""}`}>
                  {answer}
                </p>
              ) : (
                <p className="text-sm text-amber-700 italic">No answer.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
