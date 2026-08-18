import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Loader2, ArrowRight, EyeOff, Undo2, CheckCircle2 } from "lucide-react";

const KIND_LABEL = { frq: "FRQ", review: "Coding Assignment", project: "Project" };

// Everything currently waiting on the teacher, in one place, across every
// class and every kind of work - rather than having to open each course and
// each card's "View Submissions" one at a time to find out what is left.
//
// A submission can be pulled out of this pile without being graded - see the
// "Won't grade" action - for the ones that are never going to get a real
// score: a duplicate, an empty placeholder, a student who dropped. Those move
// to their own section here rather than vanishing, so marking one is easy to
// undo if it turns out to have been a mistake.
export default function NeedsGradingPanel({ open, onOpenChange, onNavigate, onChanged }) {
  const [items, setItems] = useState(null); // null = not loaded yet
  const [error, setError] = useState("");
  const [showSkipped, setShowSkipped] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open]);

  const load = async () => {
    setError("");
    try {
      setItems(await base44.entities.Submission.listNeedsGrading());
    } catch (e) {
      setError(e.message || "Couldn't load what needs grading.");
    }
  };

  const setSkipped = async (item, skipped) => {
    setBusyId(item.id);
    try {
      await base44.entities.Submission.update(item.id, { grading_skipped: skipped });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, grading_skipped: skipped } : i)));
      onChanged?.();
    } catch (e) {
      setError(e.message || "Couldn't update that.");
    } finally {
      setBusyId(null);
    }
  };

  const goGrade = (item) => {
    onNavigate(item.course_id);
    onOpenChange(false);
  };

  const toGrade = (items || []).filter((i) => !i.grading_skipped);
  const skipped = (items || []).filter((i) => i.grading_skipped);

  const Row = ({ item, skippedRow }) => (
    <div className="flex items-center gap-3 bg-white border rounded-xl p-3">
      <Badge variant="outline" className="flex-shrink-0">{KIND_LABEL[item.kind] || item.kind}</Badge>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{item.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {item.student_name}
          {item.submitted_at && ` · turned in ${format(new Date(item.submitted_at), "MMM d, h:mm a")}`}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {skippedRow ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSkipped(item, false)}
            disabled={busyId === item.id}
          >
            <Undo2 className="w-3.5 h-3.5 mr-1.5" /> Undo
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setSkipped(item, true)}
              disabled={busyId === item.id}
              title="Take this off your needs-grading list without giving it a score"
            >
              <EyeOff className="w-3.5 h-3.5 mr-1.5" /> Won&rsquo;t grade
            </Button>
            <Button size="sm" onClick={() => goGrade(item)}>
              Go grade <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Needs grading</DialogTitle>
          <DialogDescription>
            Every submitted FRQ, Coding Assignment, and Project waiting on you, oldest first, across
            every class.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {items === null ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {toGrade.length === 0 ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2 py-4">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Nothing waiting on you right
                now.
              </p>
            ) : (
              <div className="space-y-2">
                {toGrade.map((item) => (
                  <Row key={item.id} item={item} />
                ))}
              </div>
            )}

            {skipped.length > 0 && (
              <div>
                <button
                  onClick={() => setShowSkipped((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground underline mb-2"
                >
                  {showSkipped ? "Hide" : "Show"} {skipped.length} marked &ldquo;won&rsquo;t grade&rdquo;
                </button>
                {showSkipped && (
                  <div className="space-y-2">
                    {skipped.map((item) => (
                      <Row key={item.id} item={item} skippedRow />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
