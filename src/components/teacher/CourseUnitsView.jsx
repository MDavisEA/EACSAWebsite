import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Check, X, Layers, Library } from "lucide-react";
import AssignmentCard from "./AssignmentCard";
import CodingProblemCard from "./CodingProblemCard";
import ProjectCard from "./ProjectCard";

const TYPE_TABS = [
  { value: "all", label: "All" },
  { value: "frq", label: "FRQ" },
  { value: "code", label: "Short Problem" },
  { value: "project", label: "Projects" },
];

// Inside a class: its units, and the work filed under each. Units are managed
// here rather than on a settings screen, because renaming or adding one is
// something you do while looking at the work it holds.
export default function CourseUnitsView({
  course,
  assignments,
  codingProblems,
  projects,
  gradingCounts,
  onAddWork,
  onUnitCreate,
  onUnitRename,
  onUnitDelete,
  onBrowseShared,
  handlers,
}) {
  const [addingUnit, setAddingUnit] = useState("");
  const [editingUnitId, setEditingUnitId] = useState(null);
  const [editingUnitName, setEditingUnitName] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const allInCourse = [
    ...assignments.filter((a) => a.course_id === course.id).map((x) => ({ kind: "frq", item: x })),
    ...codingProblems.filter((p) => p.course_id === course.id).map((x) => ({ kind: "code", item: x })),
    ...projects.filter((p) => p.course_id === course.id).map((x) => ({ kind: "project", item: x })),
  ];
  const inCourse =
    typeFilter === "all" ? allInCourse : allInCourse.filter((w) => w.kind === typeFilter);

  const units = course.units || [];
  const unfiled = inCourse.filter((w) => !w.item.unit_id || !units.some((u) => u.id === w.item.unit_id));
  const allGroups = [
    ...units.map((u) => ({ unit: u, items: inCourse.filter((w) => w.item.unit_id === u.id) })),
    ...(unfiled.length > 0 ? [{ unit: { id: null, name: "Unfiled" }, items: unfiled }] : []),
  ];
  // With a type selected, a unit holding none of that type is just noise -
  // but on All an empty unit still needs to show so it can be added to.
  const groups = typeFilter === "all" ? allGroups : allGroups.filter((g) => g.items.length > 0);

  const addUnit = async () => {
    const name = addingUnit.trim();
    if (!name) return;
    await onUnitCreate(name);
    setAddingUnit("");
  };

  const saveUnitName = async () => {
    const name = editingUnitName.trim();
    if (!name) return;
    await onUnitRename(editingUnitId, name);
    setEditingUnitId(null);
  };

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
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs value={typeFilter} onValueChange={setTypeFilter}>
          <TabsList>
            {TYPE_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {onBrowseShared && (
          <Button variant="outline" size="sm" onClick={onBrowseShared}>
            <Library className="w-4 h-4 mr-1.5" /> Browse shared
          </Button>
        )}
      </div>

      {typeFilter !== "all" && groups.length === 0 && allInCourse.length > 0 && (
        <p className="text-sm text-muted-foreground text-center py-10 border rounded-xl bg-slate-50/40">
          No {TYPE_TABS.find((t) => t.value === typeFilter)?.label.toLowerCase()} work in this class
          yet.
        </p>
      )}

      {units.length === 0 && allInCourse.length === 0 && (
        <div className="text-center py-12 border rounded-xl bg-slate-50/40">
          <Layers className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium mb-1">No units yet</p>
          <p className="text-xs text-muted-foreground">
            Add your first unit below, then start putting assignments in it.
          </p>
        </div>
      )}

      {groups.map(({ unit, items }) => (
        <section key={unit.id || "unfiled"}>
          <div className="flex items-center justify-between mb-3 gap-2">
            {/* unit.id is null for the Unfiled bucket, and so is editingUnitId
                when nothing is being renamed - comparing them alone would put
                Unfiled permanently into edit mode. */}
            {unit.id && editingUnitId === unit.id ? (
              <div className="flex items-center gap-2 flex-1 max-w-sm">
                <Input
                  value={editingUnitName}
                  onChange={(e) => setEditingUnitName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveUnitName()}
                  className="h-8 text-sm"
                  autoFocus
                />
                <Button size="sm" variant="ghost" onClick={saveUnitName}>
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingUnitId(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide">{unit.name}</h2>
                <Badge variant="outline" className="text-xs">{items.length}</Badge>
                {unit.id && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-1.5"
                      onClick={() => { setEditingUnitId(unit.id); setEditingUnitName(unit.name); }}
                      title="Rename unit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-1.5"
                      onClick={() => onUnitDelete(unit)}
                      title="Delete unit"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            )}

            {unit.id && (
              <Button variant="outline" size="sm" onClick={() => onAddWork(unit.id)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Assignment
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

      {typeFilter === "all" && (
      <div className="flex items-center gap-2 pt-2 border-t max-w-md">
        <Input
          value={addingUnit}
          onChange={(e) => setAddingUnit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addUnit()}
          placeholder="Add a unit, e.g. Mod 3 — ArrayLists"
          className="h-9 text-sm"
        />
        <Button variant="outline" onClick={addUnit} disabled={!addingUnit.trim()}>
          <Plus className="w-4 h-4 mr-1" /> Add Unit
        </Button>
      </div>
      )}
    </div>
  );
}
