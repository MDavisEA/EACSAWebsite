import { BookOpen, Code2, FolderGit2, Clock, CircleDashed, CheckCircle2, Star, CheckCheck } from "lucide-react";

// Shared between StudentDashboard (a student looking at their own work) and
// the teacher's per-student roster detail (looking at someone else's, from
// the course side) - both group the same WorkItem shape by unit and need the
// same status vocabulary, so it is defined once rather than drifting into
// two slightly different versions of "what does 'graded' mean here."

// Icon/color per kind, kept separate from routing (only the student page
// navigates anywhere on click - the teacher view opens a grading tool
// instead), so both callers can share this without one dragging in the
// other's navigation concept.
export const WORK_KIND_META = {
  frq: { label: "FRQ", icon: BookOpen, accent: "text-primary", chip: "bg-blue-50" },
  code: { label: "Code", icon: Code2, accent: "text-emerald-600", chip: "bg-emerald-50" },
  project: { label: "Project", icon: FolderGit2, accent: "text-violet-600", chip: "bg-violet-50" },
};

// The five states, in the order they should draw attention: whatever needs
// action first, work that is genuinely finished last. 'reviewed' is not in
// this list because it leaves the main view entirely into its own section.
export const STATUS_ORDER = ["graded", "in_progress", "not_started", "submitted"];

export const STATUS = {
  not_started: { label: "Not opened", icon: CircleDashed, className: "bg-slate-100 text-slate-600" },
  in_progress: { label: "Working on it", icon: Clock, className: "bg-amber-100 text-amber-800" },
  // Says what they're waiting FOR rather than "Turned in" - the distinction
  // that matters is that there is nothing left to do yet.
  submitted: { label: "Waiting on grade", icon: CheckCircle2, className: "bg-blue-100 text-blue-800" },
  graded: { label: "New feedback", icon: Star, className: "bg-emerald-100 text-emerald-800" },
  reviewed: { label: "Reviewed", icon: CheckCheck, className: "bg-slate-100 text-slate-500" },
};

// Groups a WorkItem[] into one entry per unit, ordered by course then the
// teacher's own unit order; work never filed under a unit collects into a
// trailing "Other work" group rather than vanishing. Within a unit: status
// first, then the teacher's sort_order, then soonest deadline, then title.
export function groupWorkByUnit(items, units, courses) {
  const unitById = new Map((units || []).map((u) => [u.id, u]));
  const courseName = (id) => (courses || []).find((c) => c.id === id)?.name || "";

  const byStatusThenTeacherOrder = (a, b) =>
    STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
    (a.sort_order ?? 9999) - (b.sort_order ?? 9999) ||
    (a.due_date ? new Date(a.due_date).getTime() : Infinity) -
      (b.due_date ? new Date(b.due_date).getTime() : Infinity) ||
    (a.title || "").localeCompare(b.title || "");

  const map = new Map();
  for (const item of items || []) {
    const key = `${item.course_id ?? "none"}::${item.unit_id ?? "unfiled"}`;
    if (!map.has(key)) {
      const unit = item.unit_id ? unitById.get(item.unit_id) : null;
      map.set(key, {
        key,
        label: unit?.name || "Other work",
        course: courseName(item.course_id),
        position: unit?.position ?? 9999,
        items: [],
      });
    }
    map.get(key).items.push(item);
  }

  return [...map.values()]
    .map((g) => ({ ...g, items: g.items.sort(byStatusThenTeacherOrder) }))
    .sort((a, b) => a.course.localeCompare(b.course) || a.position - b.position || a.label.localeCompare(b.label));
}
