import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Library, FolderOpen } from "lucide-react";
import AssignmentCard from "./AssignmentCard";
import CodingProblemCard from "./CodingProblemCard";
import ProjectCard from "./ProjectCard";

// The teacher's main view: pick a course, see its units, and everything filed
// under each one regardless of type. Work used to be split into a tab per
// kind, which meant a single week of teaching was spread across three screens
// and no screen answered "what does this unit consist of".
export default function CourseworkView({
  courses,
  courseId,
  onCourseChange,
  assignments,
  codingProblems,
  projects,
  gradingCounts,
  onNew,
  onBrowseShared,
  handlers,
}) {
  const course = courses.find((c) => c.id === courseId);

  if (courses.length === 0) {
    return (
      <div className="text-center py-20">
        <FolderOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
        <h2 className="text-lg font-semibold mb-2">No courses yet</h2>
        <p className="text-muted-foreground mb-6">
          Every piece of work lives in a course, so start by making one under the Courses tab.
        </p>
      </div>
    );
  }

  // Everything filed in this course, tagged with its kind so units can hold a
  // mix without three separate lists.
  const inCourse = [
    ...assignments.filter((a) => a.course_id === courseId).map((x) => ({ kind: "frq", item: x })),
    ...codingProblems.filter((p) => p.course_id === courseId).map((x) => ({ kind: "code", item: x })),
    ...projects.filter((p) => p.course_id === courseId).map((x) => ({ kind: "project", item: x })),
  ];

  const units = course?.units || [];
  // An "Unfiled" bucket only appears when something is actually in it, so a
  // tidy course does not carry an empty heading around forever.
  const unfiled = inCourse.filter((w) => !w.item.unit_id || !units.some((u) => u.id === w.item.unit_id));
  const groups = [
    ...units.map((u) => ({ unit: u, items: inCourse.filter((w) => w.item.unit_id === u.id) })),
    ...(unfiled.length > 0 ? [{ unit: { id: null, name: "Unfiled" }, items: unfiled }] : []),
  ];

  const renderCard = ({ kind, item }) => {
    if (kind === "frq") {
      return (
        <AssignmentCard
          key={`frq-${item.id}`}
          assignment={item}
          ungradedCount={gradingCounts.byAssignment?.[item.id] || 0}
          onGraded={handlers.onGraded}
          dragHandleProps={{}}
          onEdit={() => handlers.editAssignment(item)}
          onDelete={() => handlers.deleteAssignment(item)}
          onToggleActive={() => handlers.toggleAssignmentActive(item)}
          onToggleFeatured={() => handlers.toggleFeatured(item)}
          onToggleShowAnswerKey={() => handlers.toggleShowAnswerKey(item)}
          onDuplicate={() => handlers.duplicateAssignment(item)}
        />
      );
    }
    if (kind === "code") {
      return (
        <CodingProblemCard
          key={`code-${item.id}`}
          problem={item}
          onEdit={() => handlers.editCoding(item)}
          onDelete={() => handlers.deleteCoding(item)}
          onToggleActive={() => handlers.toggleCodingActive(item)}
          onDuplicate={() => handlers.duplicateCoding(item)}
        />
      );
    }
    return (
      <ProjectCard
        key={`project-${item.id}`}
        project={item}
        ungradedCount={gradingCounts.byProject?.[item.id] || 0}
        onEdit={() => handlers.editProject(item)}
        onDelete={() => handlers.deleteProject(item)}
        onToggleActive={() => handlers.toggleProjectActive(item)}
        onDuplicate={() => handlers.duplicateProject(item)}
      />
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={courseId || ""} onValueChange={onCourseChange}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Choose a course" />
            </SelectTrigger>
            <SelectContent>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline">
            {inCourse.length} item{inCourse.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onBrowseShared}>
            <Library className="w-4 h-4 mr-1.5" /> Browse shared
          </Button>
          <Button onClick={() => onNew(null)}>
            <Plus className="w-4 h-4 mr-1.5" /> New
          </Button>
        </div>
      </div>

      {units.length === 0 && inCourse.length === 0 ? (
        <div className="text-center py-16 border rounded-xl bg-slate-50/40">
          <p className="text-sm text-muted-foreground mb-1">This course has no units yet.</p>
          <p className="text-xs text-muted-foreground">
            Add units under the Courses tab, then file work into them.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(({ unit, items }) => (
            <section key={unit.id || "unfiled"}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide">{unit.name}</h2>
                  <Badge variant="outline" className="text-xs">{items.length}</Badge>
                </div>
                {unit.id && (
                  <Button variant="ghost" size="sm" onClick={() => onNew(unit.id)}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add to this unit
                  </Button>
                )}
              </div>

              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground italic px-1">Nothing in this unit yet.</p>
              ) : (
                <div className="space-y-4">{items.map(renderCard)}</div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
