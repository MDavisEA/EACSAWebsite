import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import { WORK_KIND_META, STATUS, groupWorkByUnit } from "@/lib/workStatus";

// One student's status on every active piece of work in the course, grouped
// by unit - the teacher-facing mirror of what the student sees on their own
// dashboard (same WorkItem shape, same status vocabulary), reached by
// clicking a row in the course's roster table instead of signing in as them.
//
// Only submitted work is clickable, opening the real grading tool
// (GradingQueue, via onOpenGrading) rather than a second, read-only rendering
// of what a grader already shows - there is nothing to grade yet on
// not-started or in-progress work, so those rows are informational only.
export default function StudentRosterDetail({ open, onOpenChange, student, units, courses, onOpenGrading }) {
  const items = student?.items || [];
  const groups = groupWorkByUnit(items, units, courses);
  const missing = items.filter((i) => i.status === "not_started").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{student?.student_name}</DialogTitle>
        </DialogHeader>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No active work in this course yet.
          </p>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              {missing === 0
                ? "Nothing missing."
                : `${missing} item${missing === 1 ? "" : "s"} not started.`}
            </p>
            {groups.map((g) => (
              <div key={g.key}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {g.label}
                </h3>
                <div className="space-y-1.5">
                  {g.items.map((item) => {
                    const kindMeta = WORK_KIND_META[item.kind];
                    const Icon = kindMeta.icon;
                    const statusMeta = STATUS[item.status] || STATUS.not_started;
                    const StatusIcon = statusMeta.icon;
                    // Nothing to grade yet on not-started/in-progress work -
                    // those rows just report status.
                    const canOpen = !!item.submission_id && item.status !== "not_started" && item.status !== "in_progress";
                    const Row = canOpen ? "button" : "div";
                    return (
                      <Row
                        key={`${item.kind}-${item.id}`}
                        onClick={canOpen ? () => onOpenGrading(item.submission_id) : undefined}
                        className={`w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2 ${
                          canOpen ? "hover:border-primary/40 hover:shadow-sm transition-all" : "bg-slate-50/50"
                        }`}
                      >
                        <Icon className={`w-4 h-4 flex-shrink-0 ${kindMeta.accent}`} />
                        <span className="flex-1 min-w-0 truncate text-sm font-medium">{item.title}</span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${statusMeta.className}`}
                        >
                          <StatusIcon className="w-3 h-3" /> {statusMeta.label}
                        </span>
                        {item.score != null && (
                          <span className="text-sm font-semibold flex-shrink-0">
                            {item.score}
                            {item.points_possible ? `/${item.points_possible}` : ""}
                          </span>
                        )}
                        {item.is_late && (
                          <Badge variant="outline" className="text-[10px] text-amber-700 flex-shrink-0">
                            Late
                          </Badge>
                        )}
                        {canOpen && <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      </Row>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
