import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Plus, Pencil, Trash2, Check, X, Layers, Library, ArrowUpDown } from "lucide-react";
import ReorderUnitsDialog from "./ReorderUnitsDialog";
import AssignmentCard from "./AssignmentCard";
import CodingProblemCard from "./CodingProblemCard";
import ProjectCard from "./ProjectCard";

const TYPE_TABS = [
  { value: "all", label: "All" },
  { value: "frq", label: "FRQ" },
  { value: "code", label: "Mini Problem" },
  { value: "review", label: "Coding Assignment" },
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
  onReorderUnits,
  onReorderWork,
  handlers,
}) {
  const [addingUnit, setAddingUnit] = useState("");
  const [editingUnitId, setEditingUnitId] = useState(null);
  const [editingUnitName, setEditingUnitName] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [reorderingUnits, setReorderingUnits] = useState(false);

  const allInCourse = [
    ...assignments.filter((a) => a.course_id === course.id).map((x) => ({ kind: "frq", item: x })),
    // Mini Problems and Coding Assignments are the same table with a different
    // grading_kind, but they are different things to the teacher, so they are
    // separated back out here.
    ...codingProblems
      .filter((p) => p.course_id === course.id)
      .map((x) => ({ kind: x.grading_kind === "review" ? "review" : "code", item: x })),
    ...projects.filter((p) => p.course_id === course.id).map((x) => ({ kind: "project", item: x })),
  ];
  const inCourse =
    typeFilter === "all" ? allInCourse : allInCourse.filter((w) => w.kind === typeFilter);

  const units = course.units || [];
  const unfiled = inCourse.filter((w) => !w.item.unit_id || !units.some((u) => u.id === w.item.unit_id));
  const bySortOrder = (a, b) =>
    (a.item.sort_order ?? 9999) - (b.item.sort_order ?? 9999) ||
    (a.item.title || "").localeCompare(b.item.title || "");
  const allGroups = [
    ...units.map((u) => ({
      unit: u,
      items: inCourse.filter((w) => w.item.unit_id === u.id).sort(bySortOrder),
    })),
    ...(unfiled.length > 0
      ? [{ unit: { id: null, name: "Unfiled" }, items: [...unfiled].sort(bySortOrder) }]
      : []),
  ];
  // With a type selected, a unit holding none of that type is just noise -
  // but on All an empty unit still needs to show so it can be added to.
  const groups = typeFilter === "all" ? allGroups : allGroups.filter((g) => g.items.length > 0);

  // Reordering is only offered on All. On a filtered view the positions the
  // teacher can see are a subset, so writing them back would scramble the
  // items currently hidden.
  const dragEnabled = typeFilter === "all";

  const handleDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // Work: dropping into a different unit's list moves it there as well as
    // repositioning it, which is the obvious meaning of the gesture.
    const unitKey = (id) => (id === "unfiled" ? null : id);
    const listFor = (key) =>
      allGroups.find((g) => (g.unit.id || "unfiled") === key)?.items.slice() || [];

    const from = listFor(source.droppableId);
    const to = source.droppableId === destination.droppableId ? from : listFor(destination.droppableId);
    const idx = from.findIndex((w) => `${w.kind}-${w.item.id}` === draggableId);
    if (idx < 0) return;
    const [moved] = from.splice(idx, 1);
    to.splice(destination.index, 0, moved);

    const targetUnit = unitKey(destination.droppableId);
    const payload = [
      ...(source.droppableId === destination.droppableId
        ? []
        : from.map((w, i) => ({
            kind: w.kind,
            id: w.item.id,
            unit_id: unitKey(source.droppableId),
            sort_order: i,
          }))),
      ...to.map((w, i) => ({ kind: w.kind, id: w.item.id, unit_id: targetUnit, sort_order: i })),
    ];
    onReorderWork(payload);
  };

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

  const renderCard = ({ kind, item }, dragHandleProps) => {
    if (kind === "frq") {
      return (
        <AssignmentCard
          key={`frq-${item.id}`}
          assignment={item}
          dragHandleProps={dragHandleProps}
          ungradedCount={gradingCounts.byAssignment?.[item.id] || 0}
          onGraded={handlers.onGraded}
          onEdit={() => handlers.editAssignment(item)}
          onDelete={() => handlers.deleteAssignment(item)}
          onToggleActive={() => handlers.toggleAssignmentActive(item)}
          onToggleFeatured={() => handlers.toggleFeatured(item)}
          onToggleShowAnswerKey={() => handlers.toggleShowAnswerKey(item)}
          onDuplicate={() => handlers.duplicateAssignment(item)}
        />
      );
    }
    if (kind === "code" || kind === "review") {
      return (
        <CodingProblemCard
          key={`code-${item.id}`}
          problem={item}
          dragHandleProps={dragHandleProps}
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
        dragHandleProps={dragHandleProps}
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
        <div className="flex items-center gap-2">
          {dragEnabled && units.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => setReorderingUnits(true)}>
              <ArrowUpDown className="w-4 h-4 mr-1.5" /> Reorder units
            </Button>
          )}
          {onBrowseShared && (
            <Button variant="outline" size="sm" onClick={onBrowseShared}>
              <Library className="w-4 h-4 mr-1.5" /> Browse shared
            </Button>
          )}
        </div>
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

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="space-y-8">
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

          <Droppable droppableId={unit.id || "unfiled"} type="work" isDropDisabled={!dragEnabled}>
            {(workDrop) => (
              <div ref={workDrop.innerRef} {...workDrop.droppableProps} className="space-y-4">
                {items.length === 0 && (
                  <p className="text-xs text-muted-foreground italic px-1">
                    Nothing in this unit yet.
                  </p>
                )}
                {items.map((w, i) => (
                  <Draggable
                    key={`${w.kind}-${w.item.id}`}
                    draggableId={`${w.kind}-${w.item.id}`}
                    index={i}
                    isDragDisabled={!dragEnabled}
                  >
                    {(drag, snap) => (
                      <div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        className={snap.isDragging ? "opacity-80 shadow-xl" : ""}
                      >
                        {renderCard(w, drag.dragHandleProps)}
                      </div>
                    )}
                  </Draggable>
                ))}
                {workDrop.placeholder}
              </div>
            )}
          </Droppable>
        </section>
      ))}
        </div>
      </DragDropContext>

      <ReorderUnitsDialog
        open={reorderingUnits}
        onOpenChange={setReorderingUnits}
        units={units}
        onSave={onReorderUnits}
      />

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
