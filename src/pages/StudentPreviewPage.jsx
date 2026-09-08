import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, isPast } from "date-fns";
import { Eye, ChevronRight, Loader2 } from "lucide-react";
import { WORK_KIND_META, STATUS, groupWorkByUnit } from "@/lib/workStatus";
import { highlightNoteCode } from "@/lib/highlightNoteCode";

// A read-only row, not the clickable one StudentDashboard uses - there is no
// real submission behind any of this to open.
function WorkRow({ item }) {
  const kind = WORK_KIND_META[item.kind];
  const Icon = kind.icon;
  const overdue = item.due_date && isPast(new Date(item.due_date));
  const meta = STATUS[item.status] || STATUS.not_started;
  const StatusIcon = meta.icon;
  return (
    <div className="w-full bg-white border rounded-xl p-4 flex items-center gap-4">
      <div className={`flex-shrink-0 w-9 h-9 rounded-lg ${kind.chip} flex items-center justify-center`}>
        <Icon className={`w-4 h-4 ${kind.accent}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{item.title}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>
            <StatusIcon className="w-3 h-3" /> {meta.label}
          </span>
          {item.due_date && (
            <span className={`text-xs ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              {overdue ? "Was due " : "Due "}
              {format(new Date(item.due_date), "MMM d")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Opened in its own tab from the class page's "View as Student" button - a
// teacher-only preview of exactly what a student on this roster would see
// right now: the same active work and published notes, every item reading
// not_started since no real student is behind this. Fetched fresh from the
// server (courses/previewAsStudent) rather than reusing what the dashboard
// already has in memory, same reasoning as StudentPreviewDialog - anything
// missing here is genuinely absent for a student too.
export default function StudentPreviewPage() {
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get("course");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openNote, setOpenNote] = useState(null);

  useEffect(() => {
    if (!courseId) {
      setLoading(false);
      setError("No class specified.");
      return;
    }
    (async () => {
      try {
        setData(await base44.entities.Course.previewAsStudent(courseId));
      } catch (e) {
        setError(e.message || "Couldn't load this preview.");
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-destructive">{error || "Couldn't load this preview."}</p>
      </div>
    );
  }

  const groups = groupWorkByUnit(data.items, data.units, [{ id: courseId, name: data.course_name }]);

  return (
    <div className="min-h-screen bg-slate-50/50">
      <header className="bg-amber-50 border-b border-amber-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-2">
          <Eye className="w-4 h-4 text-amber-700 flex-shrink-0" />
          <span className="text-sm font-medium text-amber-900">
            Viewing {data.course_name} the way a student on this roster would see it right now - not a real account, nothing below can be opened.
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {data.notes.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <h2 className="text-sm font-semibold uppercase tracking-wide">Class Notes</h2>
              <Badge variant="outline" className="text-xs">{data.notes.length}</Badge>
            </div>
            <div className="space-y-2">
              {data.notes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => setOpenNote(note)}
                  className="w-full text-left bg-white border rounded-xl p-4 hover:shadow-md hover:border-primary/30 transition-all flex items-center justify-between gap-4"
                >
                  <span className="font-medium">{note.title}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </div>
          </section>
        )}

        {groups.length === 0 ? (
          <div className="text-center text-muted-foreground bg-white border rounded-xl p-10">
            <p className="text-sm">Nothing assigned in this class right now.</p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.key}>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <h2 className="text-sm font-semibold uppercase tracking-wide">{g.label}</h2>
                <Badge variant="outline" className="text-xs">{g.items.length}</Badge>
              </div>
              <div className="space-y-2">
                {g.items.map((item) => (
                  <WorkRow key={`${item.kind}-${item.id}`} item={item} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      <Dialog open={!!openNote} onOpenChange={(v) => { if (!v) setOpenNote(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{openNote?.title}</DialogTitle>
          </DialogHeader>
          <div
            className="prose prose-sm max-w-none quill-render quill-dark p-4 rounded-lg bg-[#1e1e1e] text-slate-100"
            dangerouslySetInnerHTML={{ __html: highlightNoteCode(openNote?.content_html || "") }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
