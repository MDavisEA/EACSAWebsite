import React from "react";
import { Badge } from "@/components/ui/badge";
import { Star, MessageSquare, KeyRound, CheckCircle2, XCircle, EyeOff } from "lucide-react";

// Renders one graded submission - code + checks for a coding problem, or a
// per-question breakdown for an FRQ assignment. Factored out of MyScore.jsx
// so both the access-code lookup flow and the signed-in "My Work" list
// (MyWork.jsx) render results identically instead of drifting apart.

function buildSections(sub, asgn) {
  if (!asgn) return [];
  return (asgn.questions || []).map((q, qi) => {
    const hasParts = q.parts && q.parts.length > 0;
    const items = hasParts
      ? q.parts.map((p) => {
          const key = `${q.id}_${p.id}`;
          return {
            label: `Part (${p.label})`,
            key,
            response: sub.responses?.[key] || "",
            comment: sub.part_comments?.[key] || "",
            answerKeyHtml: p.answer_key_html || "",
            answerKeyImageUrl: p.answer_key_image_url || "",
          };
        })
      : [{
          label: null,
          key: q.id,
          response: sub.responses?.[q.id] || "",
          comment: sub.part_comments?.[q.id] || "",
          answerKeyHtml: q.answer_key_html || "",
          answerKeyImageUrl: q.answer_key_image_url || "",
        }];
    return {
      title: q.title || `Question ${qi + 1}`,
      qId: q.id,
      score: sub.question_scores?.[q.id],
      maxScore: q.max_score ?? 9,
      items,
    };
  });
}

export default function SubmissionDetail({ result, assignment, codingProblem }) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="text-center mb-4">
          <p className="text-muted-foreground text-sm mb-1">Score for</p>
          <h2 className="text-xl font-bold">{result.student_name}</h2>
          {assignment && <p className="text-sm text-muted-foreground mt-1">{assignment.title}</p>}
          {codingProblem && <p className="text-sm text-muted-foreground mt-1">{codingProblem.title}</p>}
        </div>
        <div className="flex items-center justify-center gap-3 py-2">
          <Star className="w-8 h-8 text-amber-400 fill-amber-400" />
          <span className="text-5xl font-bold text-slate-800">
            {(result.coding_problem_id ? result.autograde_score : result.score) != null
              ? (result.coding_problem_id ? result.autograde_score : result.score)
              : "—"}
          </span>
          <span className="text-xl text-muted-foreground self-end mb-1">
            {result.coding_problem_id && codingProblem ? `/ ${codingProblem.points_possible ?? 0} pts` : "pts"}
          </span>
        </div>
      </div>

      {result.coding_problem_id ? (
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Your Code</p>
            <pre className="bg-slate-50 border rounded-lg p-4 text-sm font-mono whitespace-pre-wrap overflow-x-auto">
              {result.code || "(no code)"}
            </pre>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Checks</p>
            {result.compile_error ? (
              <div className="border border-destructive/30 bg-red-50 rounded-lg p-4">
                <p className="text-sm font-medium text-destructive mb-1">Compile Error</p>
                <pre className="text-xs text-destructive whitespace-pre-wrap font-mono">{result.compile_error}</pre>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(
                  (result.test_results || []).reduce((acc, r) => {
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
                {(!result.test_results || result.test_results.length === 0) && (
                  <p className="text-sm text-muted-foreground">No test results recorded.</p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        buildSections(result, assignment).map((section) => (
          <div key={section.qId} className="bg-white rounded-xl border shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800">{section.title}</h3>
              {section.score != null && (
                <Badge className="bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                  {section.score} / {section.maxScore ?? 9}
                </Badge>
              )}
            </div>
            <div className="space-y-3">
              {section.items.map(({ label, key, response, comment, answerKeyHtml, answerKeyImageUrl }) => (
                <div key={key}>
                  {label && (
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
                  )}
                  <div className={(answerKeyHtml || answerKeyImageUrl) ? "grid grid-cols-2 gap-3" : ""}>
                    <div>
                      <pre className="bg-slate-50 border rounded-lg p-3 text-sm font-mono whitespace-pre-wrap text-slate-700 overflow-x-auto h-full">
                        {response || <span className="text-slate-400 italic">(no response)</span>}
                      </pre>
                    </div>
                    {(answerKeyHtml || answerKeyImageUrl) && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <KeyRound className="w-3.5 h-3.5 text-green-600" />
                          <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Answer Key</span>
                        </div>
                        {answerKeyHtml && (
                          <div
                            className="prose prose-sm max-w-none text-green-900 quill-render"
                            dangerouslySetInnerHTML={{ __html: answerKeyHtml }}
                          />
                        )}
                        {answerKeyImageUrl && (
                          <img src={answerKeyImageUrl} alt="Answer key" className="max-w-full rounded border mt-2" />
                        )}
                      </div>
                    )}
                  </div>
                  {comment && (
                    <div className="mt-2 flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <MessageSquare className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800 whitespace-pre-wrap">{comment}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
