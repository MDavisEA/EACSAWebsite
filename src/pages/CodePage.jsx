import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Code2, AlertCircle, ChevronRight, Trophy } from "lucide-react";

export default function CodePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const problemId = searchParams.get("id");

  const [problem, setProblem] = useState(null);
  const [activeProblems, setActiveProblems] = useState([]);
  const [studentName, setStudentName] = useState("");
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

  const handleStart = () => {
    if (!studentName.trim() || !problem) return;
    sessionStorage.setItem(`student_name_${problem.id}`, studentName.trim());
    navigate(`/code-practice?id=${problem.id}`);
  };

  const handleSelect = (p) => {
    navigate(`/code?id=${p.id}`);
  };

  if (loading || (problemId && !problem && !error)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!problemId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-5">
              <Code2 className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Select a Coding Problem</h1>
            <p className="text-sm text-muted-foreground">Choose a problem to begin</p>
          </div>

          {activeProblems.length === 0 ? (
            <div className="text-center text-muted-foreground bg-card border border-border rounded-xl p-8">
              <p className="text-sm">No coding problems are available right now.</p>
              <p className="text-xs mt-1">Check back later or ask your teacher for a link.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeProblems.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  className="w-full text-left bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {p.title}
                      </h2>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Trophy className="w-3 h-3" /> {p.points_possible ?? 0} pts
                        </span>
                        <span>{(p.visible_checks?.length || 0) + (p.hidden_check_count || 0)} checks</span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground mt-6">
            Have a direct link? Use that to access your specific problem.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Unable to Load Problem</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-5">
            <Code2 className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">{problem.title}</h1>
          <div className="flex items-center justify-center gap-2 mt-3">
            <Badge variant="outline" className="font-mono text-xs">
              {problem.class_name}.{"{"}method{"}"}()
            </Badge>
            <Badge variant="outline">{problem.points_possible ?? 0} pts</Badge>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 space-y-5">
          <div>
            <label className="text-sm font-medium mb-2 block">Your Name</label>
            <Input
              placeholder="Enter your full name"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
              autoFocus
            />
          </div>
          <Button onClick={handleStart} disabled={!studentName.trim()} className="w-full" size="lg">
            Begin Problem
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Once you begin, your code will be autosaved. You can submit when ready.
          </p>
        </div>
      </div>
    </div>
  );
}
