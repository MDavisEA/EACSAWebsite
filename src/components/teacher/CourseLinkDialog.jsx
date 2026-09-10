import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Link2, Unlink } from "lucide-react";

export default function CourseLinkDialog({ open, onOpenChange, course, onChanged }) {
  const [linkable, setLinkable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setPicked("");
    (async () => {
      setLoading(true);
      try {
        setLinkable(await base44.entities.Course.listLinkable());
      } catch (e) {
        setError(e.message || "Couldn't load other courses.");
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const link = async () => {
    if (!picked) return;
    setSaving(true);
    setError("");
    try {
      await base44.entities.Course.linkCourse(course.id, picked);
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      setError(e.message || "Couldn't link that course.");
    } finally {
      setSaving(false);
    }
  };

  const unlink = async () => {
    setSaving(true);
    setError("");
    try {
      await base44.entities.Course.unlinkCourse(course.id);
      onChanged?.();
    } catch (e) {
      setError(e.message || "Couldn't unlink.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Course Links</DialogTitle>
          <DialogDescription>
            Linking pulls in a copy of everything new a colleague adds to their course, automatically -
            each copy is yours from the moment it's made, switched off until you turn it on, and editing
            it never touches theirs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {course.linked_from ? (
            <div className="border rounded-xl p-4 space-y-3">
              <p className="text-sm">
                This course is linked to <span className="font-medium">{course.linked_from.course_name}</span>
                {course.linked_from.teacher_name ? ` (${course.linked_from.teacher_name})` : ""} — anything
                new they add there gets copied in here automatically.
              </p>
              <Button variant="outline" size="sm" onClick={unlink} disabled={saving}>
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <><Unlink className="w-4 h-4 mr-1.5" /> Unlink</>
                )}
              </Button>
            </div>
          ) : loading ? (
            <div className="py-6 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : linkable.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other teacher's courses to link to yet.</p>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Link this course to</Label>
              <div className="flex items-end gap-2">
                <Select value={picked} onValueChange={setPicked}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Pick a colleague's course" />
                  </SelectTrigger>
                  <SelectContent>
                    {linkable.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {c.teacher_name ? ` (${c.teacher_name})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={link} disabled={!picked || saving}>
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <><Link2 className="w-4 h-4 mr-1.5" /> Link</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {course.linked_out_to && course.linked_out_to.length > 0 && (
            <div className="border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Colleagues receiving your new work</p>
              <ul className="space-y-1">
                {course.linked_out_to.map((l, i) => (
                  <li key={i} className="text-sm">
                    {l.course_name}
                    {l.teacher_name ? ` (${l.teacher_name})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
