import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, AlertCircle, Clock, ChevronRight } from "lucide-react";

export default function StudentEntry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assignmentId = searchParams.get("id");

  const [assignment, setAssignment] = useState(null);
  const [featuredAssignments, setFeaturedAssignments] = useState([]);
  const [studentName, setStudentName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    setAssignment(null);
    if (assignmentId) {
      loadAssignment();
    } else {
      loadFeatured();
    }
  }, [assignmentId]);

  const loadAssignment = async () => {
    const results = await base44.entities.Assignment.filter({ id: assignmentId });
    if (results.length === 0) {
      setError("Assignment not found.");
    } else if (!results[0].is_active) {
      setError("This assignment is no longer active.");
    } else if (results[0].due_date && new Date(results[0].due_date) < new Date()) {
      setError("This assignment is past its due date.");
    } else {
      setAssignment(results[0]);
    }
    setLoading(false);
  };

  const loadFeatured = async () => {
    const results = await base44.entities.Assignment.filter({ featured: true, is_active: true });
    setFeaturedAssignments(results);
    setLoading(false);
  };

  const handleStart = () => {
    if (!studentName.trim() || !assignment) return;
    sessionStorage.setItem(`student_name_${assignment.id}`, studentName.trim());
    navigate(`/exam?id=${assignment.id}`);
  };

  const handleSelectFeatured = (a) => {
    navigate(`/student?id=${a.id}`);
  };

  if (loading || (assignmentId && !assignment && !error)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // No ID in URL — show featured assignments list
  if (!assignmentId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-5">
              <BookOpen className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Select an Assignment</h1>
            <p className="text-sm text-muted-foreground">Choose an assignment to begin</p>
          </div>

          {featuredAssignments.length === 0 ? (
            <div className="text-center text-muted-foreground bg-card border border-border rounded-xl p-8">
              <p className="text-sm">No assignments are available right now.</p>
              <p className="text-xs mt-1">Check back later or ask your teacher for a link.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {featuredAssignments.map((a) => (
                <button
                  key={a.id}
                  onClick={() => handleSelectFeatured(a)}
                  className="w-full text-left bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {a.title}
                      </h2>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{a.questions?.length || 0} question{(a.questions?.length || 0) !== 1 ? "s" : ""}</span>
                        {a.time_limit_minutes && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {a.time_limit_minutes} min
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground mt-6">
            Have a direct link? Use that to access your specific assignment.
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
          <h1 className="text-xl font-semibold mb-2">Unable to Load Assignment</h1>
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
            <BookOpen className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">{assignment.title}</h1>
          {assignment.directions && (
            <p className="text-sm text-muted-foreground">{assignment.directions}</p>
          )}
          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
            <span>{assignment.questions?.length || 0} question{(assignment.questions?.length || 0) !== 1 ? "s" : ""}</span>
            {assignment.time_limit_minutes && (
              <span>{assignment.time_limit_minutes} min time limit</span>
            )}
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
          <Button
            onClick={handleStart}
            disabled={!studentName.trim()}
            className="w-full"
            size="lg"
          >
            Begin Assignment
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Once you begin, your work will be autosaved. You can submit when ready.
          </p>
        </div>
      </div>
    </div>
  );
}