import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Loader2, ArrowRight, CheckCircle2 } from "lucide-react";

const KIND_LABEL = { frq: "FRQ", review: "Coding Assignment", project: "Project", code: "Mini Problem" };

// Every submission whose reply thread currently ends with the student's own
// message - the same "needs your attention, across every class" idea as
// NeedsGradingPanel, just for conversations instead of ungraded work. A
// submission drops off this list the moment the teacher writes back (see
// needsReplyCount/listNeedsReply in submissions/index.ts), with no separate
// "mark as read" step to remember.
export default function NeedsReplyPanel({ open, onOpenChange, onGrade }) {
  const [items, setItems] = useState(null); // null = not loaded yet
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    base44.entities.Submission.listNeedsReply()
      .then(setItems)
      .catch((e) => setError(e.message || "Couldn't load pending replies."));
  }, [open]);

  const goReply = (item) => {
    onGrade(item.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Student replies</DialogTitle>
          <DialogDescription>
            Every conversation where a student wrote back last, across every class.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {items === null ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2 py-4">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> No replies waiting on you right now.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="bg-white border rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="flex-shrink-0">{KIND_LABEL[item.kind] || item.kind}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.student_name}
                      {item.last_reply_at && ` · ${format(new Date(item.last_reply_at), "MMM d, h:mm a")}`}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => goReply(item)} className="flex-shrink-0">
                    Go reply <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </div>
                {item.last_reply_text && (
                  <p className="text-sm text-slate-600 bg-slate-50 border rounded-lg p-2 whitespace-pre-wrap line-clamp-3">
                    {item.last_reply_text}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
