import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useGoogleSession, ALLOWED_STUDENT_DOMAIN } from "@/lib/useGoogleSession";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Code2, AlertCircle, ChevronRight, Trophy, LogIn } from "lucide-react";

export default function CodePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const problemId = searchParams.get("id");
  const { session, user, loading: sessionLoading, domainRejected } = useGoogleSession();

  const [problem, setProblem] = useState(null);
  const [activeProblems, setActiveProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    setProblem(null);
    if (problemId) {
      loadProblem();
    } else {
      loadActive();
    }
  }, [problemId]);

  const loadProblem = async () => {
    const results = await base44.entities.CodingProblem.filter({ id: problemId });
    if (results.length === 0) {
      setError("Problem not found or no longer active.");
    } else {
      setProblem(results[0]);
    }
    setLoading(false);
  };

  const loadActive = async () => {
    const results = await base44.entities.CodingProblem.filter({ is_active: true });
    setActiveProblems(results);
    setLoading(false);
  };

  const handleSignIn = () => {
    base44.auth.signInWithGoogle(window.location.href);
  };

  const handleStart = () => {
    if (!session || !problem) return;
    navigate(`/code-practice?id=${problem.id}`);
  };

  const handleSelect = (p) => {
    navigate(`/code?id=${p.id}`);
  };

  if (loading || sessionLoading || (problemId && !problem && !error)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e1e1e]">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!problemId) {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 mb-5">
              <Code2 className="w-7 h-7 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2 text-slate-100">Select a Code Practice Problem</h1>
            <p className="text-sm text-slate-400">Choose a problem to begin</p>
          </div>

          {activeProblems.length === 0 ? (
            <div className="text-center text-slate-400 bg-[#252526] border border-slate-700 rounded-xl p-8">
              <p className="text-sm">No code practice problems are available right now.</p>
              <p className="text-xs mt-1">Check back later or ask your teacher for a link.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeProblems.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  className="w-full text-left bg-[#252526] border border-slate-700 rounded-xl p-5 hover:border-emerald-500/50 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-slate-100 group-hover:text-emerald-400 transition-colors">
                        {p.title}
                      </h2>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Trophy className="w-3 h-3" /> {p.points_possible ?? 0} pts
                        </span>
                        <span>
                          {(p.methods || []).reduce((sum, m) => sum + (m.visible_checks?.length || 0) + (m.hidden_check_count || 0), 0)} checks
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}

          <p className="text-center text-xs text-slate-500 mt-6">
            Have a direct link? Use that to access your specific problem.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2 text-slate-100">Unable to Load Problem</h1>
          <p className="text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 mb-5">
            <Code2 className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2 text-slate-100">{problem.title}</h1>
          <div className="flex items-center justify-center gap-2 mt-3">
            <Badge variant="outline" className="font-mono text-xs border-slate-600 text-slate-300">
              {/* A whole-program problem has no method to call, so telling the
                  student to write Solution.someMethod() would be wrong. */}
              {(problem.methods || []).every((m) => m.harness_type === "program_output")
                ? `${problem.class_name}.main()`
                : `${problem.class_name}.{method}()`}
            </Badge>
            <Badge variant="outline" className="border-slate-600 text-slate-300">{problem.points_possible ?? 0} pts</Badge>
          </div>
        </div>

        <div className="bg-[#252526] rounded-xl border border-slate-700 p-6 space-y-5">
          {domainRejected && (
            <p className="text-sm text-red-400 text-center">
              Please sign in with your school Google account (@{ALLOWED_STUDENT_DOMAIN}).
            </p>
          )}
          {session ? (
            <>
              <p className="text-sm text-center text-slate-300">
                Signed in as <span className="font-medium text-slate-100">{user.user_metadata?.full_name || user.email}</span>
              </p>
              <Button onClick={handleStart} className="w-full" size="lg">
                Begin Problem
              </Button>
            </>
          ) : (
            <Button onClick={handleSignIn} className="w-full" size="lg">
              <LogIn className="w-4 h-4 mr-2" /> Sign in with Google
            </Button>
          )}
          <p className="text-xs text-center text-slate-500">
            Once you begin, your code will be autosaved. You can submit when ready.
          </p>
        </div>
      </div>
    </div>
  );
}
