import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Star, MessageSquare, KeyRound } from "lucide-react";

export default function MyScore() {
  const initialCode = new URLSearchParams(window.location.search).get("code") || "";
  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (initialCode) handleLookup();
  }, []);

  const handleLookup = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    setResult(null);
    setAssignment(null);

    const matches = await base44.entities.Submission.filter({ access_code: trimmed, submitted: true });
    if (matches.length === 0) {
      setError("No submission found for that code. Please double-check and try again.");
    } else {
      const sub = matches[0];
      setResult(sub);
      // Fetch assignment for question titles/structure
      const asgn = await base44.entities.Assignment.list();
      const found = asgn.find((a) => a.id === sub.assignment_id);
      if (found) setAssignment(found);
    }
    setLoading(false);
  };

  // Build a flat list of sections from assignment questions
  const buildSections = (sub, asgn) => {
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
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start px-4 py-12">
      <div className="w-[75vw]">
        <div className="flex items-center gap-2 justify-center mb-8">
          <BookOpen className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Check My Score</h1>
        </div>

        {!result ? (
          <div className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Enter the access code your teacher gave you to view your score.
            </p>
            <Input
              placeholder="e.g. X7K2-9PQR"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              className="text-center font-mono text-lg tracking-widest"
              maxLength={9}
            />
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <Button className="w-full" onClick={handleLookup} disabled={loading || !code.trim()}>
              {loading ? "Looking up..." : "View My Score"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header card */}
            <div className="bg-white rounded-xl border shadow-sm p-6">
              <div className="text-center mb-4">
                <p className="text-muted-foreground text-sm mb-1">Score for</p>
                <h2 className="text-xl font-bold">{result.student_name}</h2>
                {assignment && <p className="text-sm text-muted-foreground mt-1">{assignment.title}</p>}
              </div>
              <div className="flex items-center justify-center gap-3 py-2">
                <Star className="w-8 h-8 text-amber-400 fill-amber-400" />
                <span className="text-5xl font-bold text-slate-800">
                  {result.score != null ? result.score : "—"}
                </span>
                <span className="text-xl text-muted-foreground self-end mb-1">pts</span>
              </div>
            </div>

            {/* Per-question breakdown */}
            {buildSections(result, assignment).map((section) => (
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
            ))}

            <Button variant="outline" className="w-full" onClick={() => { setResult(null); setAssignment(null); setCode(""); }}>
              Look Up Another Score
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}