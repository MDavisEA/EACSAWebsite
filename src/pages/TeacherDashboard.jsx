import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, BookOpen, LogOut, KeyRound, Users } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import AssignmentForm from "@/components/teacher/AssignmentForm";
import AssignmentCard from "@/components/teacher/AssignmentCard";
import CodingProblemForm from "@/components/teacher/CodingProblemForm";
import CodingProblemCard from "@/components/teacher/CodingProblemCard";
import ProjectForm from "@/components/teacher/ProjectForm";
import ProjectCard from "@/components/teacher/ProjectCard";
import CourseForm from "@/components/teacher/CourseForm";
import CourseCard from "@/components/teacher/CourseCard";

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("assignments");
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillDone, setBackfillDone] = useState(null);

  const [codingProblems, setCodingProblems] = useState([]);
  const [showCodingForm, setShowCodingForm] = useState(false);
  const [editingCoding, setEditingCoding] = useState(null);
  const [deletingCoding, setDeletingCoding] = useState(null);

  const [projects, setProjects] = useState([]);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [deletingProject, setDeletingProject] = useState(null);

  const [courses, setCourses] = useState([]);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [deletingCourse, setDeletingCourse] = useState(null);

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
        loadCodingProblems();
        loadProjects();
        loadCourses();
      } catch {
        navigate("/");
      }
    })();
  }, []);

  const loadCodingProblems = async () => {
    const results = await base44.entities.CodingProblem.list();
    setCodingProblems(results);
  };

  const loadProjects = async () => {
    const results = await base44.entities.Project.list();
    setProjects(results);
  };

  const loadCourses = async () => {
    const results = await base44.entities.Course.list();
    setCourses(results);
  };

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

  const handleSaveCoding = async (data) => {
    if (editingCoding) {
      await base44.entities.CodingProblem.update(editingCoding.id, data);
    } else {
      await base44.entities.CodingProblem.create(data);
    }
    setShowCodingForm(false);
    setEditingCoding(null);
    loadCodingProblems();
  };

  const handleDeleteCoding = async () => {
    if (deletingCoding) {
      await base44.entities.CodingProblem.delete(deletingCoding.id);
      setDeletingCoding(null);
      loadCodingProblems();
    }
  };

  const handleToggleCodingActive = async (problem) => {
    await base44.entities.CodingProblem.update(problem.id, { is_active: !problem.is_active });
    loadCodingProblems();
  };

  const handleDuplicateCoding = async (problem) => {
    const { id, created_at, updated_at, ...data } = problem;
    await base44.entities.CodingProblem.create({
      ...data,
      title: `${problem.title} (Copy)`,
      is_active: false,
    });
    loadCodingProblems();
  };

  const handleSaveProject = async (data) => {
    if (editingProject) {
      await base44.entities.Project.update(editingProject.id, data);
    } else {
      await base44.entities.Project.create(data);
    }
    setShowProjectForm(false);
    setEditingProject(null);
    loadProjects();
  };

  const handleDeleteProject = async () => {
    if (deletingProject) {
      await base44.entities.Project.delete(deletingProject.id);
      setDeletingProject(null);
      loadProjects();
    }
  };

  const handleToggleProjectActive = async (project) => {
    await base44.entities.Project.update(project.id, { is_active: !project.is_active });
    loadProjects();
  };

  const handleSaveCourse = async (data) => {
    if (editingCourse) {
      await base44.entities.Course.update(editingCourse.id, data);
    } else {
      await base44.entities.Course.create(data);
    }
    setShowCourseForm(false);
    setEditingCourse(null);
    loadCourses();
  };

  const handleDeleteCourse = async () => {
    if (deletingCourse) {
      await base44.entities.Course.delete(deletingCourse.id);
      setDeletingCourse(null);
      loadCourses();
    }
  };

  const handleDuplicateProject = async (project) => {
    const { id, created_at, updated_at, ...data } = project;
    await base44.entities.Project.create({
      ...data,
      title: `${project.title} (Copy)`,
      is_active: false,
    });
    loadProjects();
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
            {activeTab === "assignments" && (
              <Button variant="outline" size="sm" onClick={handleBackfillCodes} disabled={backfilling}>
                <KeyRound className="w-4 h-4 mr-1" />
                {backfilling ? "Generating..." : backfillDone != null ? `Done (${backfillDone} updated)` : "Generate Missing Codes"}
              </Button>
            )}
            {activeTab === "assignments" && (
              <Button onClick={() => { setEditing(null); setShowForm(true); }}>
                <Plus className="w-4 h-4 mr-1" /> New Assignment
              </Button>
            )}
            {activeTab === "coding" && (
              <Button onClick={() => { setEditingCoding(null); setShowCodingForm(true); }}>
                <Plus className="w-4 h-4 mr-1" /> New Coding Problem
              </Button>
            )}
            {activeTab === "projects" && (
              <Button onClick={() => { setEditingProject(null); setShowProjectForm(true); }}>
                <Plus className="w-4 h-4 mr-1" /> New Project
              </Button>
            )}
            {activeTab === "courses" && (
              <Button onClick={() => { setEditingCourse(null); setShowCourseForm(true); }}>
                <Plus className="w-4 h-4 mr-1" /> New Course
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="assignments">FRQ Assignments</TabsTrigger>
            <TabsTrigger value="coding">Coding Problems</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="courses">Courses</TabsTrigger>
          </TabsList>

          <TabsContent value="assignments">
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
          </TabsContent>

          <TabsContent value="coding">
            {codingProblems.length === 0 ? (
              <div className="text-center py-20">
                <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                <h2 className="text-lg font-semibold mb-2">No coding problems yet</h2>
                <p className="text-muted-foreground mb-6">Create your first Java autograder problem to get started.</p>
                <Button onClick={() => setShowCodingForm(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Create Coding Problem
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {codingProblems.map((p) => (
                  <CodingProblemCard
                    key={p.id}
                    problem={p}
                    onEdit={() => { setEditingCoding(p); setShowCodingForm(true); }}
                    onDelete={() => setDeletingCoding(p)}
                    onToggleActive={() => handleToggleCodingActive(p)}
                    onDuplicate={() => handleDuplicateCoding(p)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="projects">
            {projects.length === 0 ? (
              <div className="text-center py-20">
                <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                <h2 className="text-lg font-semibold mb-2">No projects yet</h2>
                <p className="text-muted-foreground mb-6">
                  Create a big project - students turn in a gist link, and you get an export ready for an AI review pass.
                </p>
                <Button onClick={() => setShowProjectForm(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Create Project
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {projects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onEdit={() => { setEditingProject(p); setShowProjectForm(true); }}
                    onDelete={() => setDeletingProject(p)}
                    onToggleActive={() => handleToggleProjectActive(p)}
                    onDuplicate={() => handleDuplicateProject(p)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="courses">
            {courses.length === 0 ? (
              <div className="text-center py-20">
                <Users className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                <h2 className="text-lg font-semibold mb-2">No courses yet</h2>
                <p className="text-muted-foreground mb-6">
                  Add a course and upload a roster, then project submissions can show you who has
                  <em> not</em> turned work in - not just who has.
                </p>
                <Button onClick={() => setShowCourseForm(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Create Course
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {courses.map((c) => (
                  <CourseCard
                    key={c.id}
                    course={c}
                    onEdit={() => { setEditingCourse(c); setShowCourseForm(true); }}
                    onDelete={() => setDeletingCourse(c)}
                    onRosterChange={loadCourses}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
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

      <Dialog open={showCodingForm} onOpenChange={setShowCodingForm}>
        <DialogContent className="max-w-5xl w-[90vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCoding ? "Edit Coding Problem" : "New Coding Problem"}</DialogTitle>
          </DialogHeader>
          <CodingProblemForm
            initial={editingCoding}
            onSave={handleSaveCoding}
            onCancel={() => { setShowCodingForm(false); setEditingCoding(null); }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingCoding} onOpenChange={() => setDeletingCoding(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Coding Problem?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deletingCoding?.title}" and all related student submissions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCoding}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showProjectForm} onOpenChange={setShowProjectForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProject ? "Edit Project" : "New Project"}</DialogTitle>
          </DialogHeader>
          <ProjectForm
            initial={editingProject}
            courses={courses}
            onSave={handleSaveProject}
            onCancel={() => { setShowProjectForm(false); setEditingProject(null); }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingProject} onOpenChange={() => setDeletingProject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deletingProject?.title}" and all related student submissions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showCourseForm} onOpenChange={setShowCourseForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCourse ? "Edit Course" : "New Course"}</DialogTitle>
          </DialogHeader>
          <CourseForm
            initial={editingCourse}
            onSave={handleSaveCourse}
            onCancel={() => { setShowCourseForm(false); setEditingCourse(null); }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingCourse} onOpenChange={() => setDeletingCourse(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Course?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deletingCourse?.name}" and its roster. Student
              submissions are not deleted, but any project pointing at this course will lose its
              roster comparison. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCourse}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}