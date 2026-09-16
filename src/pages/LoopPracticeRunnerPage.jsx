import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useGoogleSession } from "@/lib/useGoogleSession";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Trophy, Home } from "lucide-react";

// The drill itself: fetch a random problem matching the assignment's
// filters, grade the answer server-side, show instant feedback, repeat
// until the running score reaches the assignment's target. Resumable - the
// score lives on the same submissions row every reload starts from.
export default function LoopPracticeRunnerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assignmentId = searchParams.get("id");
  const { session, loading: sessionLoading } = useGoogleSession();

  const [submission, setSubmission] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [traceAnswer, setTraceAnswer] = useState("");
  const [feedback, setFeedback] = useState(null); // { correct, correct_answer }
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    if (!assignmentId || !session) {
      navigate(assignmentId ? `/loop-practice?id=${assignmentId}` : "/loop-practice");
      return;
    }
    start();
  }, [sessionLoading]);

  const start = async () => {
    setLoading(true);
    setError("");
    try {
      const [sub, available] = await Promise.all([
        base44.entities.Submission.startLoopPractice(assignmentId),
        base44.entities.LoopAssignment.listAvailable(),
      ]);
      setSubmission(sub);
      setAssignment(available.find((a) => a.id === assignmentId) || null);
      if (!sub.submitted) await loadNextProblem(null);
    } catch (e) {
      setError(e.message || "Couldn't load this practice set.");
    } finally {
      setLoading(false);
    }
  };

  const loadNextProblem = async (excludeId) => {
    setFeedback(null);
    setTraceAnswer("");
    try {
      const p = await base44.entities.LoopAssignment.getProblemToAttempt(assignmentId, excludeId);
      setProblem(p);
    } catch (e) {
      setError(e.message || "No practice items are available for this set yet.");
    }
  };

  const submitAnswer = async (answer) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const data = await base44.entities.Submission.submitLoopAnswer(submission.id, problem.id, answer);
      setSubmission(data.result);
      setFeedback({ correct: data.correct, correct_answer: data.correct_answer });
    } catch (e) {
      setError(e.message || "Couldn't grade that answer.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (submission?.submitted) return;
    loadNextProblem(problem?.id);
  };

  if (loading || sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e1e1e]">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-semibold mb-2 text-slate-100">Something went wrong</h1>
          <p className="text-slate-400">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/loop-practice")}>
            <Home className="w-4 h-4 mr-2" /> Back to Loop Practice
          </Button>
        </div>
      </div>
    );
  }

  const targetScore = Number(assignment?.target_score ?? 0);

  if (submission?.submitted) {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <Trophy className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-100 mb-2">Set complete!</h1>
          <p className="text-slate-400 mb-6">
            Final score: {submission.loop_score} · {submission.loop_correct_count} correct,{" "}
            {submission.loop_wrong_count} wrong
          </p>
          <Button onClick={() => navigate("/loop-practice")}>
            <Home className="w-4 h-4 mr-2" /> Back to Loop Practice
          </Button>
        </div>
      </div>
    );
  }

  if (!problem) return null;

  return (
    <div className="min-h-screen bg-[#1e1e1e] p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-slate-400">
            <span>Score: {submission?.loop_score ?? 0}</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-slate-600 text-slate-300 capitalize">{problem.difficulty}</Badge>
              <span>{submission?.loop_correct_count ?? 0} correct · {submission?.loop_wrong_count ?? 0} wrong</span>
            </div>
          </div>
          <Progress value={Math.min(100, ((submission?.loop_score ?? 0) / Math.max(1, targetScore)) * 100)} />
        </div>

        {problem.type === "trace" ? (
          <div className="bg-[#252526] border border-slate-700 rounded-xl p-6 space-y-4">
            <h2 className="text-slate-200 font-medium">What does this print?</h2>
            <pre className="bg-[#1e1e1e] border border-slate-700 rounded-lg p-4 text-sm text-slate-100 font-mono overflow-x-auto">
              {problem.code}
            </pre>
            <Textarea
              className="font-mono text-sm bg-[#1e1e1e] border-slate-700 text-slate-100 min-h-[100px]"
              value={traceAnswer}
              onChange={(e) => setTraceAnswer(e.target.value)}
              placeholder="Type the exact output, one value per line"
              disabled={!!feedback}
            />
            {!feedback && (
              <Button onClick={() => submitAnswer(traceAnswer)} disabled={submitting || !traceAnswer.trim()}>
                Submit
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-[#252526] border border-slate-700 rounded-xl p-6 space-y-4">
            <h2 className="text-slate-200 font-medium">Which loop produces this output?</h2>
            <pre className="bg-[#1e1e1e] border border-slate-700 rounded-lg p-4 text-sm text-slate-100 font-mono overflow-x-auto">
              {problem.shown_output}
            </pre>
            <div className="grid gap-3">
              {problem.choices.map((c) => (
                <button
                  key={c.choice_index}
                  disabled={!!feedback || submitting}
                  onClick={() => submitAnswer(c.choice_index)}
                  className="text-left bg-[#1e1e1e] border border-slate-700 rounded-lg p-3 font-mono text-xs text-slate-100 hover:border-emerald-500/50 disabled:opacity-60 transition-colors"
                >
                  {c.code}
                </button>
              ))}
            </div>
          </div>
        )}

        {feedback && (
          <div
            className={`rounded-xl p-4 flex items-start gap-3 border ${
              feedback.correct ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"
            }`}
          >
            {feedback.correct ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={feedback.correct ? "text-emerald-300" : "text-red-300"}>
                {feedback.correct ? "Correct!" : "Not quite."}
              </p>
              {!feedback.correct && problem.type === "trace" && (
                <pre className="text-xs text-slate-300 font-mono mt-1 whitespace-pre-wrap">
                  Correct output:{"\n"}{feedback.correct_answer}
                </pre>
              )}
              {!feedback.correct && problem.type === "multiple_choice" && (
                <pre className="text-xs text-slate-300 font-mono mt-1 whitespace-pre-wrap">
                  Correct choice: #{Number(feedback.correct_answer) + 1}
                </pre>
              )}
              <Button size="sm" className="mt-3" onClick={handleNext}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
