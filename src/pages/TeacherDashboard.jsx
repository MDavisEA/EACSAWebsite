import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BookOpen, LogOut, Lock, ChevronLeft } from "lucide-react";
import AssignmentForm from "@/components/teacher/AssignmentForm";
import CodingProblemForm from "@/components/teacher/CodingProblemForm";
import ProjectForm from "@/components/teacher/ProjectForm";
import CourseForm from "@/components/teacher/CourseForm";
import CourseCard from "@/components/teacher/CourseCard";
import TeachersPanel from "@/components/teacher/TeachersPanel";
import TeacherHome from "@/components/teacher/TeacherHome";
import CourseUnitsView from "@/components/teacher/CourseUnitsView";
import NewWorkDialog from "@/components/teacher/NewWorkDialog";
import SharedLibraryDialog from "@/components/teacher/SharedLibraryDialog";

export default function TeacherDashboard() {
  const navigate = useNavigate();
  // Canvas-style navigation: null means the My Classes list, otherwise the
  // class being looked at. Kept as state rather than a route because the whole
  // dashboard is one authenticated page.
  const [openCourseId, setOpenCourseId] = useState(null);
  const [topTab, setTopTab] = useState("classes");
  const [courseTab, setCourseTab] = useState("assignments");
  const [deletingUnit, setDeletingUnit] = useState(null);
  const [showNewWork, setShowNewWork] = useState(false);
  const [newWorkUnitId, setNewWorkUnitId] = useState(null);
  const [showShared, setShowShared] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillDone, setBackfillDone] = useState(null);

  // { byAssignment: {id: n}, byProject: {id: n} } - submitted work with no
  // score yet, so the teacher can see what is waiting without opening each one.
  const [gradingCounts, setGradingCounts] = useState({ byAssignment: {}, byProject: {} });

  // Teacher sign-in lives on this page now that nothing links here.
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

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

  // Having a valid Supabase session is NOT enough to be a teacher - the
  // Edge Functions also require a teacher_profiles row (defense in depth), so
  // these loads can fail for a perfectly valid login. Surfacing that as a
  // message beats leaving the page on a spinner forever.
  const loadAll = async () => {
    try {
      await Promise.all([
        loadCodingProblems(),
        loadProjects(),
        loadCourses(),
        loadGradingCounts(),
        loadAssignments(),
      ]);
    } catch {
      // Sign them back out rather than leaving a live session: the shim treats
      // any password-established session as a teacher session, so a dangling
      // one would make the rest of the app take teacher-only branches.
      await supabase.auth.signOut();
      setLoading(false);
      setAuthed(false);
      setLoginError("That account isn't set up as a teacher on this site.");
    }
  };

  useEffect(() => {
    // Old version trusted a sessionStorage flag that anyone could set by
    // hand in the browser console. This checks a real server-issued session.
    (async () => {
      try {
        await base44.auth.me();
        setAuthed(true);
        loadAll();
      } catch {
        // Show the login form in place rather than redirecting. This page is
        // deliberately unlinked from the rest of the site, so bouncing to "/"
        // would land the teacher on the student dashboard with no way back in.
        setAuthed(false);
        setLoading(false);
      }
    })();
  }, []);

  // The type picker decides which form opens; the course and unit come from
  // wherever it was launched, so a new item lands where the teacher was
  // already looking rather than needing to be filed afterwards.
  const startNewWork = (kind) => {
    setShowNewWork(false);
    const seed = { course_id: openCourseId, unit_id: newWorkUnitId };
    if (kind === "frq") { setEditing(seed); setShowForm(true); }
    else if (kind === "code") { setEditingCoding(seed); setShowCodingForm(true); }
    else { setEditingProject(seed); setShowProjectForm(true); }
  };

  const handleTeacherLogin = async () => {
    setLoginError("");
    setLoggingIn(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoggingIn(false);
    if (error) {
      setLoginError("Incorrect email or password. Please try again.");
      return;
    }
    setAuthed(true);
    setLoading(true);
    loadAll();
  };

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
    // If the class being viewed was deleted, fall back to the list rather
    // than rendering a blank page.
    setOpenCourseId((current) => (current && results.some((c) => c.id === current) ? current : null));
  };

  const loadGradingCounts = async () => {
    setGradingCounts(await base44.entities.Submission.gradingCounts());
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


  const handleSave = async (data) => {
    if (editing?.id) {
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
    if (editingCoding?.id) {
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
    if (editingProject?.id) {
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

  if (!authed && !loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-100 mb-5">
              <Lock className="w-7 h-7 text-slate-600" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Teacher Sign In</h1>
          </div>
          <div className="bg-card border rounded-xl p-6 space-y-4">
            <Input
              type="email"
              placeholder="you@school.edu"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setLoginError(""); }}
              autoFocus
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setLoginError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleTeacherLogin()}
            />
            {loginError && <p className="text-sm text-destructive">{loginError}</p>}
            <Button onClick={handleTeacherLogin} className="w-full" disabled={loggingIn}>
              {loggingIn ? "Signing in..." : "Sign In"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const openCourse = courses.find((c) => c.id === openCourseId) || null;
  const sumCounts = (map) => Object.values(map || {}).reduce((a, b) => a + b, 0);
  const ungradedTotal = sumCounts(gradingCounts.byAssignment) + sumCounts(gradingCounts.byProject);

  const itemCounts = {};
  for (const c of courses) {
    itemCounts[c.id] =
      assignments.filter((a) => a.course_id === c.id).length +
      codingProblems.filter((p) => p.course_id === c.id).length +
      projects.filter((p) => p.course_id === c.id).length;
  }

  const workHandlers = {
    onGraded: loadGradingCounts,
    editAssignment: (a) => { setEditing(a); setShowForm(true); },
    deleteAssignment: (a) => setDeleting(a),
    toggleAssignmentActive: handleToggleActive,
    toggleFeatured: handleToggleFeatured,
    toggleShowAnswerKey: handleToggleShowAnswerKey,
    duplicateAssignment: handleDuplicate,
    editCoding: (p) => { setEditingCoding(p); setShowCodingForm(true); },
    deleteCoding: (p) => setDeletingCoding(p),
    toggleCodingActive: handleToggleCodingActive,
    duplicateCoding: handleDuplicateCoding,
    editProject: (p) => { setEditingProject(p); setShowProjectForm(true); },
    deleteProject: (p) => setDeletingProject(p),
    toggleProjectActive: handleToggleProjectActive,
    duplicateProject: handleDuplicateProject,
  };

  return (
    <div className="min-h-screen bg-slate-50/50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <button
            onClick={() => setOpenCourseId(null)}
            className="flex items-center gap-3 hover:opacity-70 transition-opacity"
          >
            <BookOpen className="w-5 h-5 text-primary" />
            <h1 className="font-semibold text-lg">AP CSA</h1>
          </button>
          <div className="flex items-center gap-2">
            <Button
              variant={openCourseId ? "ghost" : "outline"}
              size="sm"
              onClick={() => { setOpenCourseId(null); setTopTab("teachers"); }}
            >
              Teachers
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} title="Sign out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {openCourse ? (
          <div className="space-y-6">
            <div>
              <button
                onClick={() => setOpenCourseId(null)}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
              >
                <ChevronLeft className="w-4 h-4" /> My Classes
              </button>
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-bold tracking-tight">{openCourse.name}</h1>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setEditingCourse(openCourse); setShowCourseForm(true); }}
                >
                  Rename
                </Button>
              </div>
            </div>

            <Tabs value={courseTab} onValueChange={setCourseTab}>
              <TabsList className="mb-6">
                <TabsTrigger value="assignments">
                  Assignments
                  {ungradedTotal > 0 && (
                    <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">
                      {ungradedTotal}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="people">People</TabsTrigger>
              </TabsList>

              <TabsContent value="assignments">
                <CourseUnitsView
                  course={openCourse}
                  assignments={assignments}
                  codingProblems={codingProblems}
                  projects={projects}
                  gradingCounts={gradingCounts}
                  onAddWork={(unitId) => { setNewWorkUnitId(unitId); setShowNewWork(true); }}
                  onUnitCreate={async (name) => {
                    await base44.entities.Course.createUnit(openCourse.id, name);
                    loadCourses();
                  }}
                  onUnitRename={async (id, name) => {
                    await base44.entities.Course.renameUnit(id, name);
                    loadCourses();
                  }}
                  onUnitDelete={(unit) => setDeletingUnit(unit)}
                  onBrowseShared={() => setShowShared(true)}
                  handlers={workHandlers}
                />
              </TabsContent>

              <TabsContent value="people">
                <CourseCard
                  course={openCourse}
                  showUnits={false}
                  startExpanded
                  onEdit={() => { setEditingCourse(openCourse); setShowCourseForm(true); }}
                  onDelete={() => setDeletingCourse(openCourse)}
                  onRosterChange={loadCourses}
                />
              </TabsContent>
            </Tabs>
          </div>
        ) : topTab === "teachers" ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold tracking-tight">Teachers</h1>
              <Button variant="outline" size="sm" onClick={() => setTopTab("classes")}>
                Back to My Classes
              </Button>
            </div>
            <TeachersPanel />
          </div>
        ) : (
          <TeacherHome
            courses={courses}
            counts={itemCounts}
            onOpen={(id) => { setOpenCourseId(id); setCourseTab("assignments"); }}
            onNewCourse={() => { setEditingCourse(null); setShowCourseForm(true); }}
          />
        )}

      </main>

      <AlertDialog open={!!deletingUnit} onOpenChange={() => setDeletingUnit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deletingUnit?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The assignments in it are not deleted — they move to Unfiled, so you can put them
              somewhere else.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await base44.entities.Course.deleteUnit(deletingUnit.id);
                setDeletingUnit(null);
                loadCourses();
                loadAssignments();
                loadCodingProblems();
                loadProjects();
              }}
            >
              Delete unit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NewWorkDialog
        open={showNewWork}
        onOpenChange={setShowNewWork}
        onPick={startNewWork}
        courseName={courses.find((c) => c.id === openCourseId)?.name}
        unitName={
          courses
            .find((c) => c.id === openCourseId)
            ?.units?.find((u) => u.id === newWorkUnitId)?.name
        }
      />

      <SharedLibraryDialog
        open={showShared}
        onOpenChange={setShowShared}
        courses={courses}
        onCopied={loadCodingProblems}
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Assignment" : "New FRQ Assignment"}</DialogTitle>
          </DialogHeader>
          <AssignmentForm
            initial={editing}
            courses={courses}
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
            <DialogTitle>{editingCoding?.id ? "Edit Short Problem" : "New Short Problem"}</DialogTitle>
          </DialogHeader>
          <CodingProblemForm
            initial={editingCoding}
            courses={courses}
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
            <DialogTitle>{editingProject?.id ? "Edit Project" : "New Project"}</DialogTitle>
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