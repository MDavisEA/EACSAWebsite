import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Loader2, ArrowRight, CheckCircle2 } from "lucide-react";

const KIND_LABEL = { frq: "FRQ", code: "Mini Problem", review: "Coding Assignment", project: "Project" };

// Who has not yet confirmed they read feedback the teacher specifically
// flagged "must acknowledge" - the checkbox in every grader. Distinct from
// NeedsGradingPanel: everything here is already graded, this is purely about
// whether the student has actually looked at it.
export default function OutstandingAckPanel({ open, onOpenChange, onGrade }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    base44.entities.Submission.listOutstandingAck()
      .then(setItems)
      .catch((e) => setError(e.message || "Couldn't load outstanding feedback."));
  }, [open]);

  const openItem = (item) => {
    onGrade(item.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Outstanding feedback</DialogTitle>
          <DialogDescription>
            Graded work where you asked the student to confirm they read your feedback, and they
            have not yet done so - oldest first, across every class.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {items === null ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2 py-4">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Everyone has acknowledged their
            required feedback.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 bg-white border rounded-xl p-3">
                <Badge variant="outline" className="flex-shrink-0">{KIND_LABEL[item.kind] || item.kind}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.student_name}
                    {item.submitted_at && ` · turned in ${format(new Date(item.submitted_at), "MMM d, h:mm a")}`}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openItem(item)} className="flex-shrink-0">
                  Open <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
