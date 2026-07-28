import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SubmissionDetail from "@/components/SubmissionDetail";
import { BookOpen } from "lucide-react";

export default function MyScore() {
  const initialCode = new URLSearchParams(window.location.search).get("code") || "";
  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [codingProblem, setCodingProblem] = useState(null);
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
    setCodingProblem(null);

    const matches = await base44.entities.Submission.filter({ access_code: trimmed, submitted: true });
    if (matches.length === 0) {
      setError("No submission found for that code. Please double-check and try again.");
    } else {
      const sub = matches[0];
      setResult(sub);
      if (sub.coding_problem_id) {
        const probs = await base44.entities.CodingProblem.filter({ id: sub.coding_problem_id });
        if (probs.length > 0) setCodingProblem(probs[0]);
      } else {
        // Fetch assignment for question titles/structure
        const asgn = await base44.entities.Assignment.list();
        const found = asgn.find((a) => a.id === sub.assignment_id);
        if (found) setAssignment(found);
      }
    }
    setLoading(false);
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
            <SubmissionDetail result={result} assignment={assignment} codingProblem={codingProblem} />

            <Button variant="outline" className="w-full" onClick={() => { setResult(null); setAssignment(null); setCodingProblem(null); setCode(""); }}>
              Look Up Another Score
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}