import React from "react";
import { Button } from "@/components/ui/button";
import { Plus, Upload } from "lucide-react";
import LoopAssignmentCard from "./LoopAssignmentCard";
import LoopProblemCard from "./LoopProblemCard";

// Top-level "Loop Practice" area: the question bank (imported or
// hand-authored) and the practice sets assembled from it, standalone or
// filed under a class. A practice set filed under a class also shows up in
// that class's own Loop Practice tab (see CourseUnitsView) - this is the one
// place every practice set is visible regardless of where it's filed.
export default function LoopPracticePanel({
  problems,
  assignments,
  courses,
  onNewProblem,
  onEditProblem,
  onDeleteProblem,
  onToggleProblemActive,
  onImportProblems,
  onNewAssignment,
  onEditAssignment,
  onDeleteAssignment,
  onToggleAssignmentActive,
}) {
  const courseName = (id) => courses.find((c) => c.id === id)?.name;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Practice Sets</h2>
          <Button size="sm" onClick={onNewAssignment}>
            <Plus className="w-4 h-4 mr-1.5" /> New Practice Set
          </Button>
        </div>
        {assignments.length === 0 ? (
          <div className="text-center text-muted-foreground bg-white border rounded-xl p-8">
            <p className="text-sm">No practice sets yet. Create one once you have some problems in the bank below.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((a) => (
              <div key={a.id}>
                {a.course_id && (
                  <p className="text-xs text-muted-foreground mb-1">{courseName(a.course_id) || "Unfiled class"}</p>
                )}
                <LoopAssignmentCard
                  assignment={a}
                  onEdit={() => onEditAssignment(a)}
                  onDelete={() => onDeleteAssignment(a)}
                  onToggleActive={() => onToggleAssignmentActive(a)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Problem Bank ({problems.length})</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onImportProblems}>
              <Upload className="w-4 h-4 mr-1.5" /> Import Bank
            </Button>
            <Button size="sm" onClick={onNewProblem}>
              <Plus className="w-4 h-4 mr-1.5" /> New Problem
            </Button>
          </div>
        </div>
        {problems.length === 0 ? (
          <div className="text-center text-muted-foreground bg-white border rounded-xl p-8">
            <p className="text-sm">No practice problems yet. Import a generated bank or add one by hand.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {problems.map((p) => (
              <LoopProblemCard
                key={p.id}
                problem={p}
                onEdit={() => onEditProblem(p)}
                onDelete={() => onDeleteProblem(p)}
                onToggleActive={() => onToggleProblemActive(p)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
