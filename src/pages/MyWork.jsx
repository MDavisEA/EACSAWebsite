import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useGoogleSession } from "@/lib/useGoogleSession";
import { Button } from "@/components/ui/button";
import SubmissionDetail from "@/components/SubmissionDetail";
import { Star, BookOpen, Code2, ChevronRight, LogIn, FolderGit2 } from "lucide-react";

// The digital replacement for typing an access code: once a student is
// signed in, every graded submission of theirs (FRQ + coding) is right
// here - no code to lose or ask a teacher for. MyScore.jsx (access-code
// lookup) stays as-is for anyone with an older, pre-sign-in submission.
export default function MyWork() {
  const navigate = useNavigate();
  const { session, user, loading: sessionLoading } = useGoogleSession();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [assignmentsById, setAssignmentsById] = useState({});
  const [codingProblemsById, setCodingProblemsById] = useState({});
  const [projectsById, setProjectsById] = useState({});

  useEffect(() => {
    if (sessionLoading) return;
    if (!session) { setLoading(false); return; }
    load();
  }, [sessionLoading]);

  const load = async () => {
    setLoading(true);
    const results = await base44.entities.Submission.filter({ mine: true, submitted: true });
    setSubmissions(results);

    const assignmentIds = [...new Set(results.filter((r) => r.assignment_id).map((r) => r.assignment_id))];
    const codingProblemIds = [...new Set(results.filter((r) => r.coding_problem_id).map((r) => r.coding_problem_id))];
    const projectIds = [...new Set(results.filter((r) => r.project_id).map((r) => r.project_id))];

    if (assignmentIds.length > 0) {
      const allAssignments = await base44.entities.Assignment.list();
      const map = {};
      allAssignments.filter((a) => assignmentIds.includes(a.id)).forEach((a) => { map[a.id] = a; });
      setAssignmentsById(map);
    }
    if (codingProblemIds.length > 0) {
      const fetched = await Promise.all(
        codingProblemIds.map((id) => base44.entities.CodingProblem.filter({ id }))
      );
      const map = {};
      fetched.flat().forEach((p) => { map[p.id] = p; });
      setCodingProblemsById(map);
    }
    if (projectIds.length > 0) {
      const fetched = await Promise.all(projectIds.map((id) => base44.entities.Project.filter({ id })));
      const map = {};
      fetched.flat().forEach((p) => { map[p.id] = p; });
      setProjectsById(map);
    }
    setLoading(false);
  };

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-5">
            <Star className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">My Work</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Sign in with your school Google account to see all of your graded work in one place.
          </p>
          <Button onClick={() => base44.auth.signInWithGoogle(window.location.href)} size="lg">
            <LogIn className="w-4 h-4 mr-2" /> Sign in with Google
          </Button>
        </div>
      </div>
    );
  }

  if (selected) {
    const assignment = selected.assignment_id ? assignmentsById[selected.assignment_id] : null;
    const codingProblem = selected.coding_problem_id ? codingProblemsById[selected.coding_problem_id] : null;
    const project = selected.project_id ? projectsById[selected.project_id] : null;
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start px-4 py-12">
        <div className="w-[75vw]">
          <Button variant="outline" className="mb-4" onClick={() => setSelected(null)}>
            ← Back to My Work
          </Button>
          <SubmissionDetail
            result={selected}
            assignment={assignment}
            codingProblem={codingProblem}
            project={project}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-1">My Work</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {user.user_metadata?.full_name || user.email}
          </p>
        </div>

        {submissions.length === 0 ? (
          <div className="text-center text-muted-foreground bg-white border rounded-xl p-8">
            <p className="text-sm">Nothing graded yet.</p>
            <p className="text-xs mt-1">Once your teacher grades something (or an autograded problem is submitted), it will show up here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((sub) => {
              const title = sub.coding_problem_id
                ? codingProblemsById[sub.coding_problem_id]?.title || "Coding Problem"
                : sub.project_id
                ? projectsById[sub.project_id]?.title || "Project"
                : assignmentsById[sub.assignment_id]?.title || "Assignment";
              // A project shows no score until the teacher releases feedback -
              // otherwise a student would see a number before any human had
              // looked at the AI-assisted review that produced it.
              const score = sub.coding_problem_id
                ? sub.autograde_score
                : sub.project_id
                ? (sub.feedback_released ? sub.score : null)
                : sub.score;
              const maxScore = sub.coding_problem_id ? codingProblemsById[sub.coding_problem_id]?.points_possible : null;
              return (
                <button
                  key={sub.id}
                  onClick={() => setSelected(sub)}
                  className="w-full text-left bg-white border rounded-xl p-5 hover:border-primary/40 hover:shadow-md transition-all group flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    {sub.coding_problem_id ? (
                      <Code2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    ) : sub.project_id ? (
                      <FolderGit2 className="w-5 h-5 text-violet-600 flex-shrink-0" />
                    ) : (
                      <BookOpen className="w-5 h-5 text-primary flex-shrink-0" />
                    )}
                    <div>
                      <h2 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {title}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Submitted {sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm font-semibold text-slate-700">
                      {score != null ? score : "—"}{maxScore != null ? ` / ${maxScore}` : ""}
                    </span>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <Button variant="outline" className="w-full mt-6" onClick={() => navigate("/")}>
          Return to Home
        </Button>
      </div>
    </div>
  );
}
