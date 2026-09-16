import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useGoogleSession, ALLOWED_STUDENT_DOMAIN } from "@/lib/useGoogleSession";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Repeat2, AlertCircle, ChevronRight, LogIn } from "lucide-react";

// Cycled across the picker list purely for visual variety - carries no
// meaning about the assignment itself.
const ACCENT_COLORS = [
  { border: "border-l-emerald-500/60", pill: "bg-emerald-500/15 text-emerald-300" },
  { border: "border-l-sky-500/60", pill: "bg-sky-500/15 text-sky-300" },
  { border: "border-l-violet-500/60", pill: "bg-violet-500/15 text-violet-300" },
  { border: "border-l-amber-500/60", pill: "bg-amber-500/15 text-amber-300" },
  { border: "border-l-pink-500/60", pill: "bg-pink-500/15 text-pink-300" },
];

// Picker + "begin" screen, same dual-mode shape as CodePage.jsx: no ?id=
// lists every active practice set (standalone ones and course-scoped ones
// alike - course is organizational here, not an access gate, same as the
// autograder's problems), ?id=... shows a start screen and redirects into
// the runner once signed in.
export default function LoopPracticePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assignmentId = searchParams.get("id");
  const { session, user, loading: sessionLoading, domainRejected } = useGoogleSession();

  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    load();
  }, []);

  const load = async () => {
    const results = await base44.entities.LoopAssignment.listAvailable();
    setAssignments(results);
    setLoading(false);
  };

  const assignment = assignments.find((a) => a.id === assignmentId) || null;

  useEffect(() => {
    if (assignmentId && !loading && assignments.length > 0 && !assignment) {
      setError("This practice set isn't available right now.");
    }
  }, [assignmentId, loading, assignments]);

  const handleSignIn = () => {
    base44.auth.signInWithGoogle(window.location.href);
  };

  useEffect(() => {
    if (!sessionLoading && session && assignment) {
      navigate(`/loop-practice-run?id=${assignment.id}`, { replace: true });
    }
  }, [sessionLoading, session, assignment, navigate]);

  const handleSelect = (a) => navigate(`/loop-practice?id=${a.id}`);

  if (loading || sessionLoading || (assignmentId && !assignment && !error)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e1e1e]">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!assignmentId) {
    const standalone = assignments.filter((a) => !a.course_id);
    const byCourse = assignments.filter((a) => a.course_id);

    return (
      <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-400/20 mb-5">
              <Repeat2 className="w-7 h-7 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2 text-slate-100">Loop Practice</h1>
            <p className="text-sm text-slate-400">Choose a practice set to begin</p>
          </div>

          {assignments.length === 0 ? (
            <div className="text-center text-slate-400 bg-[#252526] border border-slate-700 rounded-xl p-8">
              <p className="text-sm">No loop practice sets are available right now.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...standalone, ...byCourse].map((a, i) => {
                const accent = ACCENT_COLORS[i % ACCENT_COLORS.length];
                return (
                  <button
                    key={a.id}
                    onClick={() => handleSelect(a)}
                    className={`w-full text-left bg-[#252526] border border-slate-700 border-l-4 ${accent.border} rounded-xl p-5 hover:shadow-md transition-all group`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="font-semibold text-slate-100 group-hover:text-emerald-400 transition-colors">
                          {a.title}
                        </h2>
                        <div className="flex items-center gap-2 mt-1.5 text-xs">
                          <span className={`px-2 py-0.5 rounded-full font-medium ${accent.pill}`}>
                            {a.target_score} correct to finish
                          </span>
                          {a.courses?.name && <span className="text-slate-400">{a.courses.name}</span>}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2 text-slate-100">Unable to Load Practice Set</h1>
          <p className="text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-400/20 mb-5">
            <Repeat2 className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2 text-slate-100">{assignment.title}</h1>
          <div className="flex items-center justify-center gap-2 mt-3">
            <Badge variant="outline" className="border-slate-600 text-slate-300">
              {assignment.target_score} correct to finish
            </Badge>
          </div>
        </div>

        <div className="bg-[#252526] rounded-xl border border-slate-700 p-6 space-y-5">
          {domainRejected && (
            <p className="text-sm text-red-400 text-center">
              Please sign in with your school Google account (@{ALLOWED_STUDENT_DOMAIN}).
            </p>
          )}
          {session ? (
            <p className="text-sm text-center text-slate-300">
              Signed in as <span className="font-medium text-slate-100">{user.user_metadata?.full_name || user.email}</span>
            </p>
          ) : (
            <Button onClick={handleSignIn} className="w-full" size="lg">
              <LogIn className="w-4 h-4 mr-2" /> Sign in with Google
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
