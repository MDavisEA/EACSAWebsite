import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import CodeMirror from "@uiw/react-codemirror";
import { java } from "@codemirror/lang-java";
import { a11yDarkEditorTheme } from "@/lib/codeEditorThemes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Play, Send, CheckCircle2, XCircle, EyeOff, Loader2, Trophy } from "lucide-react";

// Defined once at module scope, not inline in JSX - a new array reference
// on every render makes @uiw/react-codemirror tear down and rebuild the
// editor's state, which drops the current selection/cursor mid-edit.
const CODE_EXTENSIONS = [java(), ...a11yDarkEditorTheme];

export default function CodePracticePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const problemId = searchParams.get("id");
  const studentName = problemId
    ? (sessionStorage.getItem(`student_name_${problemId}`) || "")
    : "";

  const draftKey = problemId && studentName ? `code_draft_${problemId}_${studentName}` : null;

  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);
  const [runError, setRunError] = useState("");
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [finalized, setFinalized] = useState(false);

  const submissionRef = useRef(null); // { id, session_token }

  useEffect(() => {
    if (!problemId || !studentName) {
      navigate(problemId ? `/code?id=${problemId}` : "/code");
      return;
    }
    load();
  }, []);

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
      student_name: studentName,
      submitted: false,
    });

    let sub;
    if (existing.length > 0) {
      sub = existing[0];
    } else {
      sub = await base44.entities.Submission.create({
        coding_problem_id: problemId,
        student_name: studentName,
      });
    }
    submissionRef.current = { id: sub.id, session_token: sub.session_token };
    setCode(draft || sub.code || p.starter_code || "");
    setLoading(false);
  };

  const handleCodeChange = (value) => {
    setCode(value);
    if (draftKey) localStorage.setItem(draftKey, value);
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

  const handleRun = async () => {
    setRunning(true);
    setRunError("");
    try {
      const data = await runTests(false);
      setResults(data);
    } catch (e) {
      setRunError(e.message || "Something went wrong running your code. Please try again.");
    } finally {
      setRunning(false);
    }
  };

  const handleSubmitFinal = async () => {
    setShowSubmitConfirm(false);
    setSubmitting(true);
    setRunError("");
    try {
      const data = await runTests(true);
      setResults(data);
      if (!data.compile_error) {
        await base44.entities.Submission.update(submissionRef.current.id, { submitted: true });
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

  const resultsById = {};
  (results?.test_results || []).forEach((r) => { resultsById[r.test_id] = r; });

  const checklist = [
    ...(problem.visible_checks || []).map((c) => ({ ...c, hidden: false })),
    ...Array.from({ length: problem.hidden_check_count || 0 }, (_, i) => ({
      id: `__hidden_${i}`,
      label: "Hidden test",
      hidden: true,
    })),
  ];

  return (
    <div className="h-screen flex flex-col bg-[#1e1e1e] text-slate-100 overflow-hidden">
      <header className="bg-[#252526] border-b border-slate-700 flex-shrink-0 px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="font-semibold truncate text-slate-100">{problem.title}</h1>
          <Badge variant="outline" className="font-mono text-xs flex-shrink-0 border-slate-600 text-slate-300">
            {problem.class_name}
          </Badge>
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

          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Checks</h3>
            <div className="space-y-2">
              {checklist.map((c) => {
                const r = resultsById[c.id];
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
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-slate-200">
                    {results.tests_passed}/{results.tests_total} checks passed
                    {typeof results.autograde_score === "number" && ` — ${results.autograde_score} pts`}
                  </p>
                  {(results.test_results || []).filter((r) => !r.hidden).map((r) => (
                    <div key={r.test_id} className="text-xs text-slate-400 flex items-start gap-1.5">
                      {r.passed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                      )}
                      <span>{r.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-slate-700 bg-[#252526] px-4 py-3 flex items-center justify-end gap-3 flex-shrink-0">
            <Button
              variant="outline"
              onClick={handleRun}
              disabled={running || submitting || finalized}
              className="border-slate-600 text-slate-100 bg-transparent hover:bg-slate-700 hover:text-slate-100"
            >
              {running ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Running...</>
              ) : (
                <><Play className="w-4 h-4 mr-1.5" /> Run My Tests</>
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
