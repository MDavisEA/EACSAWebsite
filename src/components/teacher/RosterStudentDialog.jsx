import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// One student, added fresh or edited/moved - a roster uploaded once at the
// start of the year still needs onepatch-at-a-time changes afterward: a late
// transfer in, a typo'd email, a period change, or a transfer between two of
// the teacher's own classes. Deliberately not routed through replaceRoster,
// which wipes and re-inserts a whole roster (or section of one) - the wrong
// shape for touching a single row.
//
// `mode: "add"` only ever targets `course` (the roster you have open) - there
// is no reason to add a new person into a class you are not looking at.
// `mode: "edit"` additionally offers a class picker, since "move" can mean a
// different section OR a genuinely different course.
export default function RosterStudentDialog({ open, onOpenChange, mode, course, allCourses = [], student, onSaved }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sectionId, setSectionId] = useState("none");
  const [courseId, setCourseId] = useState(course?.id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(mode === "edit" ? student?.student_name || "" : "");
    setEmail(mode === "edit" ? student?.email || "" : "");
    setSectionId((mode === "edit" ? student?.section_id : null) || "none");
    setCourseId((mode === "edit" ? student?.course_id : course?.id) || course?.id || "");
    setError("");
  }, [open, mode, student, course]);

  // The class this student would land in after saving - its OWN sections,
  // not the roster's original course, once a different class is picked.
  const targetCourse = allCourses.find((c) => c.id === courseId) || course;
  const sections = targetCourse?.sections || [];

  const handleSave = async () => {
    if (!name.trim()) { setError("A name is required."); return; }
    setSaving(true);
    setError("");
    try {
      if (mode === "add") {
        await base44.entities.Course.addRosterStudent(course.id, {
          student_name: name.trim(),
          email: email.trim(),
          section_id: sectionId === "none" ? null : sectionId,
        });
      } else {
        await base44.entities.Course.updateRosterStudent(student.id, {
          student_name: name.trim(),
          email: email.trim(),
          section_id: sectionId === "none" ? null : sectionId,
          course_id: courseId,
        });
      }
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      setError(e.message || "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add a Student" : "Edit Student"}</DialogTitle>
          {mode === "add" && <DialogDescription>Adds one person to {course?.name}'s roster.</DialogDescription>}
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria Lopez" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mlopez@episcopalacademy.org"
            />
            <p className="text-xs text-muted-foreground">
              Has to match the Google account they sign in with - optional, but matching is exact
              with an email and unreliable without one.
            </p>
          </div>

          {mode === "edit" && allCourses.length > 1 && (
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select value={courseId} onValueChange={(v) => { setCourseId(v); setSectionId("none"); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allCourses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {courseId !== student?.course_id && (
                <p className="text-xs text-amber-700">
                  Moves them out of {course?.name} entirely - their grades and submissions there
                  stay exactly as they are, but this class's work will stop showing up for them.
                </p>
              )}
            </div>
          )}

          {sections.length > 0 && (
            <div className="space-y-1.5">
              <Label>Section</Label>
              <Select value={sectionId} onValueChange={setSectionId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No section</SelectItem>
                  {sections.map((sec) => (
                    <SelectItem key={sec.id} value={sec.id}>
                      {sec.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving..." : mode === "add" ? "Add Student" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
