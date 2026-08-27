import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { User, Loader2, ChevronRight, ChevronLeft, Search } from "lucide-react";
import { WORK_KIND_META, STATUS, groupWorkByUnit } from "@/lib/workStatus";

// Everyone in this teacher's classes, in one place, with one student's whole
// record a click away. Distinct from the per-course People tab: that answers
// "who in this class hasn't turned this in", this answers "how is this kid
// doing" - which spans classes and includes work from units already finished.
//
// One entry per person rather than per roster row, so a student on two of
// these classes is one name to click, not two.
export default function MyStudentsDialog({ open, onOpenChange }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  // The student currently opened, and their work once it arrives.
  const [picked, setPicked] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setLoading(true);
    base44.entities.Course.listMyStudents()
      .then(setStudents)
      .catch((e) => setError(e.message || "Couldn't load your students."))
      .finally(() => setLoading(false));
  }, [open]);

  // Back to the list whenever the dialog is closed, so re-opening does not
  // land mid-way inside whoever was looked at last.
  useEffect(() => {
    if (!open) {
      setPicked(null);
      setDetail(null);
      setQuery("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        (s.student_name || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.courses || []).some((c) => (c.course_name || "").toLowerCase().includes(q))
    );
  }, [students, query]);

  const openStudent = async (s) => {
    setPicked(s);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const result = await base44.entities.Course.myStudentWork({
        email: s.email,
        student_name: s.student_name,
      });
      // Dropped if they have already clicked back or on to someone else.
      setPicked((cur) => {
        if (cur?.key === s.key) setDetail(result);
        return cur;
      });
    } catch (e) {
      setDetailError(e.message || "Couldn't load that student's work.");
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {picked && (
              <button
                onClick={() => { setPicked(null); setDetail(null); }}
                className="text-muted-foreground hover:text-foreground"
                title="Back to all students"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {picked ? picked.student_name : "My Students"}
          </DialogTitle>
          {!picked && (
            <DialogDescription>
              Everyone on a roster in one of your classes. Click a student to see everything
              they have done.
            </DialogDescription>
          )}
          {picked?.email && (
            <DialogDescription className="font-mono text-xs">{picked.email}</DialogDescription>
          )}
        </DialogHeader>

        {picked ? (
          <StudentRecord loading={detailLoading} error={detailError} detail={detail} />
        ) : loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : students.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            No students on any of your rosters yet. Upload a roster on a class&rsquo;s People tab.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email, or class"
                className="pl-9"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {filtered.length} student{filtered.length === 1 ? "" : "s"}
              {query.trim() && ` matching "${query.trim()}"`}
            </p>

            <div className="border rounded-lg divide-y overflow-hidden">
              {filtered.map((s) => (
                <button
                  key={s.key}
                  onClick={() => openStudent(s)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium truncate">{s.student_name || "(no name)"}</span>
                  {!s.email && (
                    <Badge variant="outline" className="text-[10px] text-slate-500 flex-shrink-0">
                      No email
                    </Badge>
                  )}
                  <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                    {(s.courses || []).map((c) => (
                      <Badge key={c.roster_id} variant="outline" className="text-[10px] text-slate-600">
                        {c.course_name}
                      </Badge>
                    ))}
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nobody matches that.
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// One student's record: the headline numbers first, then every piece of work
// grouped the same way their own dashboard groups it.
function StudentRecord({ loading, error, detail }) {
  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) return <p className="text-sm text-destructive py-4">{error}</p>;
  if (!detail) return null;

  const items = detail.items || [];
  const groups = groupWorkByUnit(items, detail.units, detail.courses);
  const showCourse = (detail.courses || []).length > 1;

  // Only work that has actually been marked counts toward the average - an
  // assignment nobody has graded yet is not a zero, and counting it as one
  // would make every student look worse the further ahead the class gets.
  const scored = items.filter((i) => i.score != null && i.points_possible);
  const earned = scored.reduce((sum, i) => sum + i.score, 0);
  const possible = scored.reduce((sum, i) => sum + i.points_possible, 0);
  const pct = possible > 0 ? Math.round((earned / possible) * 100) : null;

  const notStarted = items.filter((i) => i.status === "not_started").length;
  const late = items.filter((i) => i.is_late).length;
  const waiting = items.filter((i) => i.status === "submitted").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat
          label="Graded so far"
          value={pct == null ? "—" : `${pct}%`}
          sub={possible > 0 ? `${earned}/${possible} pts` : "nothing graded yet"}
        />
        <Stat label="Not started" value={notStarted} tone={notStarted > 0 ? "warn" : undefined} />
        <Stat label="Turned in late" value={late} tone={late > 0 ? "warn" : undefined} />
        <Stat label="Waiting on you" value={waiting} />
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No work in their class{(detail.courses || []).length === 1 ? "" : "es"} yet.
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.key}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.label}
              </h3>
              {showCourse && g.course && (
                <span className="text-xs text-muted-foreground">{g.course}</span>
              )}
              <Badge variant="outline" className="text-xs">{g.items.length}</Badge>
            </div>
            <div className="space-y-1.5">
              {g.items.map((item) => {
                const kindMeta = WORK_KIND_META[item.kind];
                const Icon = kindMeta.icon;
                const statusMeta = STATUS[item.status] || STATUS.not_started;
                const StatusIcon = statusMeta.icon;
                return (
                  <div
                    key={`${item.kind}-${item.id}`}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2 bg-slate-50/40"
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${kindMeta.accent}`} />
                    <span className="flex-1 min-w-0 truncate text-sm font-medium">{item.title}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${statusMeta.className}`}
                    >
                      <StatusIcon className="w-3 h-3" /> {statusMeta.label}
                    </span>
                    {item.is_late && (
                      <Badge variant="outline" className="text-[10px] text-amber-700 flex-shrink-0">
                        Late
                      </Badge>
                    )}
                    {item.score != null && (
                      <span className="text-sm font-semibold flex-shrink-0">
                        {item.score}
                        {item.points_possible ? `/${item.points_possible}` : ""}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className="border rounded-lg px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${tone === "warn" ? "text-amber-700" : ""}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
