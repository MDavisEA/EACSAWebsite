import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useGoogleSession } from "@/lib/useGoogleSession";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import HighlightedCode from "@/components/HighlightedCode";
import { CheckCircle2, XCircle, Trophy, Home, Terminal, ListChecks, Circle } from "lucide-react";

const DIFFICULTY_COLOR = {
  easy: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  hard: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

// Purely decorative labels for the 4 multiple-choice options - color/letter
// carry no meaning about which one is correct, just visual variety.
const OPTION_STYLE = [
  { letter: "A", classes: "bg-sky-500/15 text-sky-300 border-sky-500/40" },
  { letter: "B", classes: "bg-violet-500/15 text-violet-300 border-violet-500/40" },
  { letter: "C", classes: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  { letter: "D", classes: "bg-pink-500/15 text-pink-300 border-pink-500/40" },
];

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
  // Picking a multiple-choice option only highlights it - grading happens on
  // an explicit Submit click, same as trace. A bare onClick-to-grade design
  // meant one accidental/mistimed click (a stray double-click, a click that
  // lands right as the page finishes loading) silently graded a wrong answer
  // nobody meant to give.
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [feedback, setFeedback] = useState(null); // { correct, correct_answer }
  const [submitting, setSubmitting] = useState(false);

  // A standalone set (no course_id) needs no sign-in - only a course-scoped
  // one does, checked once the assignment itself is known below.
  const anonTokenKey = (id) => `loop_anon_token_${id}`;

  useEffect(() => {
    if (sessionLoading) return;
    if (!assignmentId) {
      navigate("/loop-practice");
      return;
    }
    start();
  }, [sessionLoading]);

  const start = async () => {
    setLoading(true);
    setError("");
    try {
      const available = await base44.entities.LoopAssignment.listAvailable();
      const a = available.find((x) => x.id === assignmentId) || null;
      if (!a) {
        setError("This practice set isn't available right now.");
        setLoading(false);
        return;
      }
      setAssignment(a);
      if (a.course_id && !session) {
        navigate(`/loop-practice?id=${assignmentId}`, { replace: true });
        return;
      }
      const cachedToken = a.course_id ? undefined : localStorage.getItem(anonTokenKey(assignmentId)) || undefined;
      const sub = await base44.entities.Submission.startLoopPractice(assignmentId, cachedToken);
      if (!a.course_id && sub.session_token) {
        localStorage.setItem(anonTokenKey(assignmentId), sub.session_token);
      }
      setSubmission(sub);
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
    setSelectedChoice(null);
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
      const data = await base44.entities.Submission.submitLoopAnswer(
        submission.id,
        problem.id,
        answer,
        submission.session_token
      );
      setSubmission(data.result);
      setFeedback({ correct: data.correct, correct_answer: data.correct_answer, picked_output: data.picked_output });
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
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-400/20 mb-4">
            <Trophy className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-2">Set complete!</h1>
          <p className="text-slate-400 mb-6">
            Final score: <span className="text-emerald-300 font-semibold">{submission.loop_score}</span> ·{" "}
            <span className="text-emerald-400">{submission.loop_correct_count} correct</span>,{" "}
            <span className="text-rose-400">{submission.loop_wrong_count} wrong</span>
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
            <span className="font-semibold text-emerald-300">Score: {submission?.loop_score ?? 0}</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`capitalize ${DIFFICULTY_COLOR[problem.difficulty] || "border-slate-600 text-slate-300"}`}>
                {problem.difficulty}
              </Badge>
              <span>
                <span className="text-emerald-400">{submission?.loop_correct_count ?? 0} correct</span>
                {" · "}
                <span className="text-rose-400">{submission?.loop_wrong_count ?? 0} wrong</span>
              </span>
            </div>
          </div>
          <Progress
            value={Math.min(100, ((submission?.loop_score ?? 0) / Math.max(1, targetScore)) * 100)}
            className="[&>div]:bg-gradient-to-r [&>div]:from-emerald-400 [&>div]:to-teal-300"
          />
        </div>

        {problem.type === "trace" ? (
          <div className="bg-[#252526] border border-slate-700 rounded-xl p-6 space-y-4">
            <h2 className="flex items-center gap-2 text-slate-200 font-medium">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/15 text-blue-300 flex-shrink-0">
                <Terminal className="w-4 h-4" />
              </span>
              What does this print?
            </h2>
            <HighlightedCode code={problem.code} className="rounded-lg p-4 border border-slate-700 overflow-x-auto" />
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
            <h2 className="flex items-center gap-2 text-slate-200 font-medium">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-500/15 text-violet-300 flex-shrink-0">
                <ListChecks className="w-4 h-4" />
              </span>
              Which loop produces this output?
            </h2>
            <pre className="bg-[#1e1e1e] border border-slate-700 rounded-lg p-4 text-sm text-slate-100 font-mono overflow-x-auto">
              {problem.shown_output}
            </pre>
            <div className="grid gap-3">
              {problem.choices.map((c, i) => {
                const style = OPTION_STYLE[i % OPTION_STYLE.length];
                const selected = selectedChoice === c.choice_index;
                return (
                  <button
                    key={c.choice_index}
                    disabled={!!feedback || submitting}
                    onClick={() => setSelectedChoice(c.choice_index)}
                    className={`flex items-start gap-3 text-left bg-[#1e1e1e] border rounded-lg p-3 disabled:opacity-60 transition-colors ${
                      selected ? "border-emerald-400 ring-1 ring-emerald-400/50" : "border-slate-700 hover:border-slate-500"
                    }`}
                  >
                    {selected ? (
                      <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-emerald-400" />
                    ) : (
                      <Circle className="w-4 h-4 mt-1 flex-shrink-0 text-slate-600" />
                    )}
                    <span
                      className={`flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md border text-xs font-semibold ${style.classes}`}
                    >
                      {style.letter}
                    </span>
                    <HighlightedCode code={c.code} className="flex-1 rounded-md p-2" />
                  </button>
                );
              })}
            </div>
            {!feedback && (
              <Button onClick={() => submitAnswer(selectedChoice)} disabled={submitting || selectedChoice === null}>
                Submit
              </Button>
            )}
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
                <div className="mt-1.5 space-y-3">
                  {feedback.picked_output != null && (
                    <div className="space-y-1">
                      <p className="text-xs text-slate-400">The loop you picked actually prints:</p>
                      <pre className="text-xs text-slate-300 font-mono bg-[#1e1e1e] border border-slate-700 rounded p-2 whitespace-pre-wrap">
                        {feedback.picked_output}
                      </pre>
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400">The correct loop was:</p>
                    <HighlightedCode code={feedback.correct_answer} className="rounded p-2" />
                  </div>
                </div>
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
