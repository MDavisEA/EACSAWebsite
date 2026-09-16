import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import HighlightedCode from "@/components/HighlightedCode";
import { Pencil, Trash2 } from "lucide-react";

const DIFFICULTY_COLOR = {
  easy: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  hard: "bg-rose-100 text-rose-800",
};

export default function LoopProblemCard({ problem, onEdit, onDelete, onToggleActive }) {
  return (
    <div className="flex items-start justify-between gap-3 border rounded-lg p-3 bg-white">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Badge variant="outline">{problem.type === "trace" ? "Trace" : "Multiple choice"}</Badge>
          <Badge variant="outline" className={DIFFICULTY_COLOR[problem.difficulty] || ""}>
            {problem.difficulty}
          </Badge>
          <span className="text-xs text-muted-foreground">{problem.topic}</span>
          {!problem.is_active && <Badge variant="secondary">Inactive</Badge>}
        </div>
        {problem.type === "trace" ? (
          <HighlightedCode code={problem.code} className="rounded p-2 line-clamp-2" />
        ) : (
          <pre className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap break-words">
            {problem.shown_output}
          </pre>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Switch checked={problem.is_active} onCheckedChange={onToggleActive} className="mr-1" />
        <Button variant="ghost" size="sm" onClick={onEdit}><Pencil className="w-4 h-4" /></Button>
        <Button variant="ghost" size="sm" onClick={onDelete}><Trash2 className="w-4 h-4 text-destructive" /></Button>
      </div>
    </div>
  );
}
