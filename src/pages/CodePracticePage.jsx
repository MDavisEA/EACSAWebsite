import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useGoogleSession } from "@/lib/useGoogleSession";
import CodeMirror from "@uiw/react-codemirror";
import { java } from "@codemirror/lang-java";
import { a11yDarkEditorTheme } from "@/lib/codeEditorThemes";
import SampleOutputs from "@/components/SampleOutputs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import InteractiveRunner from "@/components/InteractiveRunner";
import { Play, Send, CheckCircle2, XCircle, EyeOff, Loader2, Trophy, Home } from "lucide-react";

// Defined once at module scope, not inline in JSX - a new array reference
// on every render makes @uiw/react-codemirror tear down and rebuild the
// editor's state, which drops the current selection/cursor mid-edit.
const CODE_EXTENSIONS = [java(), ...a11yDarkEditorTheme];

export default function CodePracticePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const problemId = searchParams.get("id");
  const { session, user, loading: sessionLoading } = useGoogleSession();
  const studentName = user?.user_metadata?.full_name || user?.email || "";

  const draftKey = problemId && user ? `code_draft_${problemId}_${user.id}` : null;

  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);
  const [runError, setRunError] = useState("");
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [finalized, setFinalized] = useState(false);
  // Practice runs already spent. Seeded from the resumed submission so the
  // count survives a reload, then kept in step with what the server reports.
  const [runsUsed, setRunsUsed] = useState(0);
  // Coding Assignment problems only: the live runner, opened on demand.
  const [showRunner, setShowRunner] = useState(false);

  const submissionRef = useRef(null); // { id, session_token }
  const draftTimer = useRef(null);

  useEffect(() => () => clearTimeout(draftTimer.current), []);

  useEffect(() => {
    if (sessionLoading) return;
    if (!problemId || !session) {
      navigate(problemId ? `/code?id=${problemId}` : "/code");
      return;
    }
    load();
  }, [sessionLoading]);

  const load = async () => {
    const results = await base44.entities.CodingProblem.filter({ id: problemId });
    if (results.length === 0) {
      navigate("/code");
      return;
    }
    const p = results[0];
    setProblem(p);

    const draft = draftKey ? localStorage.getItem(draftKey) : null;

    const existing = await base44.entities.Submission.filter({
      coding_problem_id: problemId,
      submitted: false,
    });

    let sub;
    if (existing.length > 0) {
      sub = existing[0];
    } else {
      sub = await base44.entities.Submission.create({ coding_problem_id: problemId });
    }

    // create() now hands back an already-submitted row rather than making a
    // second one (see startCoding) whenever this problem was already turned
    // in - which happens just by revisiting this page after submitting, no
    // special action needed. There is nothing to edit in that case; the
    // dashboard already has the real "view what you turned in / turn it in
    // again" flow, so send them there instead of quietly reopening an
    // editor on a submission that a Submit click here cannot actually change
    // (submitFinal treats an already-submitted row as a no-op).
    if (sub.submitted) {
      navigate("/");
      return;
    }

    submissionRef.current = { id: sub.id, session_token: sub.session_token };
    setRunsUsed((sub.run_history || []).filter((h) => !h.final).length);
    setCode(draft || sub.code || p.starter_code || "");
    setLoading(false);
  };

  const handleCodeChange = (value) => {
    setCode(value);
    if (draftKey) localStorage.setItem(draftKey, value);
    // localStorage alone means the work only exists on this one machine, in
    // this one browser profile - a school laptop that gets reimaged, or a
    // student who moves rooms, loses everything. Push the draft to the server
    // too, debounced so it is one write per pause rather than per keystroke.
    if (!submissionRef.current) return;
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      base44.entities.Submission.update(submissionRef.current.id, { code: value }).catch(() => {
        // A failed autosave is not worth interrupting typing over - the local
        // copy still has it, and Submit Final sends the code itself.
      });
    }, 3000);
  };

  const handleGoHome = () => {
    // Same write the debounced autosave would have made - fired immediately
    // instead of waiting out the timer, since we're not sure the tab will
    // stick around long enough for it to fire on its own.
    clearTimeout(draftTimer.current);
    if (submissionRef.current) {
      base44.entities.Submission.update(submissionRef.current.id, { code }).catch(() => {});
    }
    navigate("/");
  };

  const runTests = async (final) => {
    const sub = submissionRef.current;
    const res = await base44.functions.invoke("runJavaTests", {
      submission_id: sub.id,
      session_token: sub.session_token,
      coding_problem_id: problemId,
      code,
      final,
    });
    return res.data;
  };

  // A Coding Assignment has no tests, so "run" means actually running the
  // program and talking to it - which is the only way to check a Scanner-driven
  // program does what it should. Unlimited: it is their own work, nothing is
  // scored until they submit.
  const handlePlainRun = () => {
    setRunError("");
    setShowRunner(true);
  };

  const handleRun = async () => {
    setRunning(true);
    setRunError("");
    try {
      const data = await runTests(false);
      setResults(data);
      if (typeof data.runs_used === "number") setRunsUsed(data.runs_used);
    } catch (e) {
      setRunError(e.message || "Something went wrong running your code. Please try again.");
      // Only the cap itself should disable the button - a network blip or a
      // Piston outage must not cost a student their remaining runs. Matches on
      // the message this app's own edge function returns for that one case.
      if (problem?.max_test_runs != null && /used all \d+ test runs/.test(e.message || "")) {
        setRunsUsed(problem.max_test_runs);
      }
    } finally {
      setRunning(false);
    }
  };

  const handleSubmitFinal = async () => {
    setShowSubmitConfirm(false);
    setSubmitting(true);
    setRunError("");
    try {
      // A Coding Assignment problem has no harness to run, so submitting is just
      // handing the code in - there is no score to compute.
      if (problem.grading_kind === "review") {
        await base44.entities.Submission.update(submissionRef.current.id, {
          code,
          submitted: true,
          submitted_at: new Date().toISOString(),
        });
        if (draftKey) localStorage.removeItem(draftKey);
        setFinalized(true);
        navigate("/submitted");
        return;
      }
      const data = await runTests(true);
      setResults(data);
      if (!data.compile_error) {
        // run-java-tests marks the submission submitted itself when
        // final is true and there's no compile error - no separate
        // finalize call needed (and no gap between two round-trips for
        // something to interrupt).
        if (draftKey) localStorage.removeItem(draftKey);
        setFinalized(true);
        navigate("/submitted");
      }
    } catch (e) {
      setRunError(e.message || "Something went wrong submitting your code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !problem) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e1e1e]">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  const isReviewKind = problem.grading_kind === "review";

  // null when the problem has no cap, so the counter stays hidden entirely.
  const runsLeft =
    problem.max_test_runs == null ? null : Math.max(0, problem.max_test_runs - runsUsed);

  const resultsByKey = {};
  (results?.test_results || []).forEach((r) => { resultsByKey[`${r.method_name}::${r.test_id}`] = r; });

  const methodChecklists = (problem.methods || []).map((m) => ({
    method_name: m.method_name,
    checks: [
      ...(m.visible_checks || []).map((c) => ({ ...c, hidden: false })),
      ...Array.from({ length: m.hidden_check_count || 0 }, (_, i) => ({
        id: `__hidden_${i}`,
        label: "Hidden test",
        hidden: true,
      })),
    ],
  }));

  return (
    <div className="h-screen flex flex-col bg-[#1e1e1e] text-slate-100 overflow-hidden">
      <header className="bg-[#252526] border-b border-slate-700 flex-shrink-0 px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="text-slate-400 hover:text-slate-200 flex-shrink-0"
            title="Save and return to your dashboard"
          >
            <Home className="w-4 h-4" />
          </button>
          <h1 className="font-semibold truncate text-slate-100">{problem.title}</h1>
          {/* Displaying the class name here reads as a requirement, which it
              is for an autograded problem but never was for a hand-graded
              one - Piston runs whatever the student names their own class. */}
          {problem.grading_kind !== "review" && (
            <Badge variant="outline" className="font-mono text-xs flex-shrink-0 border-slate-600 text-slate-300">
              {problem.class_name}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-400 flex-shrink-0">
          <span>{studentName}</span>
          <Badge className="flex items-center gap-1 bg-slate-700 text-slate-100 hover:bg-slate-700">
            <Trophy className="w-3 h-3" /> {problem.points_possible ?? 0} pts
          </Badge>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: problem + checklist */}
        <div className="w-2/5 border-r border-slate-700 overflow-y-auto p-6 space-y-6 bg-[#252526]">
          <div
            className="prose prose-sm prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: problem.description_html || "" }}
          />

          {(problem.sample_outputs || []).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Sample output
              </h3>
              <SampleOutputs items={problem.sample_outputs} dark />
            </div>
          )}

          {isReviewKind && (
            <div>
              <h3 className="text-xs font-semibold text-amber-400/90 uppercase tracking-wide mb-1">
                Trying it out
              </h3>
              <p className="text-xs text-slate-400">
                Hit <span className="text-slate-200">Run My Code</span> to actually run your program
                and type into it, the same as running it on your own computer. Do it as many times
                as you like — nothing is graded until you press Submit Final.
              </p>
            </div>
          )}

          <div className="space-y-5">
            {!isReviewKind && methodChecklists.map((mc) => (
              <div key={mc.method_name}>
                <h3 className="text-xs font-mono font-semibold text-emerald-400/90 mb-2">{mc.method_name}()</h3>
                <div className="space-y-2">
                  {mc.checks.map((c) => {
                    const r = c.hidden ? null : resultsByKey[`${mc.method_name}::${c.id}`];
                    return (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 text-sm border border-slate-700 rounded-lg px-3 py-2 bg-[#2d2d2d]"
                      >
                        {c.hidden ? (
                          <EyeOff className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        ) : r ? (
                          r.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                          )
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-slate-600 flex-shrink-0" />
                        )}
                        <span className={c.hidden ? "text-slate-500 italic" : "text-slate-200"}>
                          {c.label}
                        </span>
                        {!c.hidden && "points" in c && (
                          <span className="ml-auto text-xs text-slate-500">{c.points} pt</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: code editor + results */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <CodeMirror
              value={code}
              onChange={handleCodeChange}
              editable={!finalized}
              theme="none"
              extensions={CODE_EXTENSIONS}
              height="100%"
              style={{ height: "100%" }}
              basicSetup={{ tabSize: 4 }}
            />
          </div>

          {runError && (
            <div className="border-t border-slate-700 bg-red-950/40 px-4 py-3 flex-shrink-0">
              <p className="text-sm text-red-300">{runError}</p>
            </div>
          )}

          {results && (
            <div className="border-t border-slate-700 bg-[#252526] px-4 py-3 max-h-48 overflow-y-auto flex-shrink-0">
              {results.compile_error ? (
                <div>
                  <p className="text-sm font-medium text-red-400 mb-1">Compile Error</p>
                  <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono">{results.compile_error}</pre>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-sm font-medium text-slate-200">
                    {results.tests_passed}/{results.tests_total} checks passed
                    {typeof results.autograde_score === "number" && ` — ${results.autograde_score} pts`}
                  </p>
                  {(problem.methods || []).map((m) => {
                    const methodResults = (results.test_results || []).filter(
                      (r) => r.method_name === m.method_name && !r.hidden
                    );
                    if (methodResults.length === 0) return null;
                    return (
                      <div key={m.method_name} className="space-y-1">
                        <p className="text-xs font-mono font-semibold text-slate-400">{m.method_name}()</p>
                        {methodResults.map((r) => (
                          <div key={r.test_id} className="text-xs text-slate-400 flex items-start gap-1.5 pl-2">
                            {r.passed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                            )}
                            <span>{r.detail}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-slate-700 bg-[#252526] px-4 py-3 flex items-center justify-end gap-3 flex-shrink-0">
            {!isReviewKind && runsLeft !== null && (
              <span
                className={`text-xs mr-auto ${
                  runsLeft === 0 ? "text-amber-400" : "text-slate-400"
                }`}
              >
                {runsLeft === 0
                  ? "No test runs left — you can still submit."
                  : `${runsLeft} of ${problem.max_test_runs} test run${
                      problem.max_test_runs === 1 ? "" : "s"
                    } left`}
              </span>
            )}
            <Button
              variant="outline"
              onClick={isReviewKind ? handlePlainRun : handleRun}
              disabled={running || submitting || finalized || (!isReviewKind && runsLeft === 0)}
              className="border-slate-600 text-slate-100 bg-transparent hover:bg-slate-700 hover:text-slate-100"
            >
              {running ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Running...</>
              ) : (
                <><Play className="w-4 h-4 mr-1.5" /> {isReviewKind ? "Run My Code" : "Run My Tests"}</>
              )}
            </Button>
            <Button onClick={() => setShowSubmitConfirm(true)} disabled={running || submitting || finalized}>
              {submitting ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Submitting...</>
              ) : (
                <><Send className="w-4 h-4 mr-1.5" /> Submit Final</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* The live runner. A copy of their draft, not the draft itself - the
          editor behind this dialog stays the thing that gets autosaved and
          submitted, so nothing typed in here can quietly become their
          submission. */}
      <Dialog open={showRunner} onOpenChange={setShowRunner}>
        <DialogContent className="max-w-[92vw] w-[92vw]">
          <DialogHeader>
            <DialogTitle>Run your program</DialogTitle>
            <DialogDescription>
              Press Run, then type your answers right into the console. This is a scratch copy for
              testing — keep editing in the editor behind this window, since that is what gets
              submitted.
            </DialogDescription>
          </DialogHeader>
          <InteractiveRunner
            code={code}
            fileName={`${problem.class_name || "Main"}.java`}
            resetKey={showRunner ? "open" : "closed"}
            height={560}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent className="bg-[#252526] border-slate-700 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Leave this problem?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Your code is saved. You have not submitted yet - come back and finish anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-slate-600 text-slate-100 hover:bg-slate-700 hover:text-slate-100">
              Keep Working
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleGoHome}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <AlertDialogContent className="bg-[#252526] border-slate-700 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Submit Final?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This runs your code against all checks (including hidden ones) one last time and locks in your score.
              You won't be able to make further changes. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-slate-600 text-slate-100 hover:bg-slate-700 hover:text-slate-100">
              Keep Working
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmitFinal}>Submit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
