import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BookOpen, Code2, FileCode, FolderGit2, ChevronRight } from "lucide-react";

// The four kinds of work, described by what the teacher gets rather than by
// how the grader is implemented - "mini problem" means more to someone
// planning a week than "program_output harness" does.
const KINDS = [
  {
    kind: "frq",
    icon: BookOpen,
    title: "FRQ Practice",
    blurb: "Written answers in AP free-response style. You grade them, with an optional time limit.",
    accent: "text-primary",
    chip: "bg-blue-50",
  },
  {
    kind: "code",
    icon: Code2,
    title: "Mini Problem",
    blurb: "Java that gets checked automatically. Either whole-program output or specific methods.",
    accent: "text-emerald-600",
    chip: "bg-emerald-50",
  },
  {
    kind: "review",
    icon: FileCode,
    title: "Code Review",
    blurb:
      "Java you mark by hand. You read the code, run it right there to see the output, and comment on specific lines.",
    accent: "text-amber-600",
    chip: "bg-amber-50",
  },
  {
    kind: "project",
    icon: FolderGit2,
    title: "Project",
    blurb: "Bigger work turned in as a Gist, reviewed against a rubric with your AI assistant.",
    accent: "text-violet-600",
    chip: "bg-violet-50",
  },
];

export default function NewWorkDialog({ open, onOpenChange, onPick, courseName, unitName }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>What kind of work?</DialogTitle>
          <DialogDescription>
            {courseName ? (
              <>
                Adding to <strong>{courseName}</strong>
                {unitName ? <> · {unitName}</> : null}. You can change either on the next screen.
              </>
            ) : (
              "You can pick the course and unit on the next screen."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 pt-1">
          {KINDS.map(({ kind, icon: Icon, title, blurb, accent, chip }) => (
            <button
              key={kind}
              onClick={() => onPick(kind)}
              className="w-full text-left border rounded-xl p-4 hover:border-primary/40 hover:shadow-sm transition-all flex items-start gap-3 group"
            >
              <div className={`flex-shrink-0 w-9 h-9 rounded-lg ${chip} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${accent}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium group-hover:text-primary transition-colors">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{blurb}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
