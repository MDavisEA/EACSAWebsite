import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, BookOpen, LogOut, KeyRound } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import AssignmentForm from "@/components/teacher/AssignmentForm";
import AssignmentCard from "@/components/teacher/AssignmentCard";

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillDone, setBackfillDone] = useState(null);

  const generateCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      if (i === 4) code += "-";
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  };

  const handleBackfillCodes = async () => {
    setBackfilling(true);
    setBackfillDone(null);
    const all = await base44.entities.Submission.filter({ submitted: true });
    const missing = all.filter((s) => !s.access_code);
    await Promise.all(
      missing.map((s) => base44.entities.Submission.update(s.id, { access_code: generateCode() }))
    );
    setBackfilling(false);
    setBackfillDone(missing.length);
  };

  useEffect(() => {
    // Old version trusted a sessionStorage flag that anyone could set by
    // hand in the browser console. This checks a real server-issued session.
    (async () => {
      try {
        await base44.auth.me();
        loadAssignments();
      } catch {
        navigate("/");
      }
    })();
  }, []);

  const loadAssignments = async () => {
    const results = await base44.entities.Assignment.list("-created_date");
    // Sort by sort_order if set, otherwise keep server order
    const sorted = [...results].sort((a, b) => {
      const aO = a.sort_order ?? 9999;
      const bO = b.sort_order ?? 9999;
      return aO - bO;
    });
    setAssignments(sorted);
    setLoading(false);
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const reordered = Array.from(assignments);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setAssignments(reordered);
    // Persist new order
    await Promise.all(
      reordered.map((a, i) => base44.entities.Assignment.update(a.id, { sort_order: i }))
    );
  };

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.Assignment.update(editing.id, data);
    } else {
      await base44.entities.Assignment.create(data);
    }
    setShowForm(false);
    setEditing(null);
    loadAssignments();
  };

  const handleDelete = async () => {
    if (deleting) {
      await base44.entities.Assignment.delete(deleting.id);
      setDeleting(null);
      loadAssignments();
    }
  };

  const handleToggleActive = async (assignment) => {
    await base44.entities.Assignment.update(assignment.id, { is_active: !assignment.is_active });
    loadAssignments();
  };

  const handleDuplicate = async (assignment) => {
    const { id, created_date, updated_date, created_by, ...data } = assignment;
    await base44.entities.Assignment.create({
      ...data,
      title: `${assignment.title} (Copy)`,
      is_active: false,
    });
    loadAssignments();
  };

  const handleToggleFeatured = async (assignment) => {
    await base44.entities.Assignment.update(assignment.id, { featured: !assignment.featured });
    loadAssignments();
  };

  const handleToggleShowAnswerKey = async (assignment) => {
    await base44.entities.Assignment.update(assignment.id, { show_answer_key: !assignment.show_answer_key });
    loadAssignments();
  };

  const handleLogout = async () => {
    await base44.auth.logout();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-primary" />
            <h1 className="font-semibold text-lg">AP CSA Teacher Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleBackfillCodes} disabled={backfilling}>
              <KeyRound className="w-4 h-4 mr-1" />
              {backfilling ? "Generating..." : backfillDone != null ? `Done (${backfillDone} updated)` : "Generate Missing Codes"}
            </Button>
            <Button onClick={() => { setEditing(null); setShowForm(true); }}>
              <Plus className="w-4 h-4 mr-1" /> New Assignment
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {assignments.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">No assignments yet</h2>
            <p className="text-muted-foreground mb-6">Create your first FRQ assignment to get started.</p>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-1" /> Create Assignment
            </Button>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="assignments">
              {(provided) => (
                <div className="space-y-4" {...provided.droppableProps} ref={provided.innerRef}>
                  {assignments.map((a, index) => (
                    <Draggable key={a.id} draggableId={a.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={snapshot.isDragging ? "opacity-80 shadow-xl" : ""}
                        >
                          <AssignmentCard
                            assignment={a}
                            dragHandleProps={provided.dragHandleProps}
                            onEdit={() => { setEditing(a); setShowForm(true); }}
                            onDelete={() => setDeleting(a)}
                            onToggleActive={() => handleToggleActive(a)}
                            onToggleFeatured={() => handleToggleFeatured(a)}
                            onToggleShowAnswerKey={() => handleToggleShowAnswerKey(a)}
                            onDuplicate={() => handleDuplicate(a)}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </main>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Assignment" : "New Assignment"}</DialogTitle>
          </DialogHeader>
          <AssignmentForm
            initial={editing}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleting?.title}" and all its submissions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}