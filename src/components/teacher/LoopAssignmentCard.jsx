import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Link2, Copy, Check, Repeat2, Users, ChevronDown, ChevronUp } from "lucide-react";
import LoopSubmissionViewer from "./LoopSubmissionViewer";

export default function LoopAssignmentCard({ assignment, onEdit, onDelete, onToggleActive, dragHandleProps }) {
  const [copied, setCopied] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const studentLink = `${window.location.origin}/loop-practice?id=${assignment.id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(studentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border rounded-lg p-4 bg-white space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {dragHandleProps && <span {...dragHandleProps} className="cursor-grab text-slate-300">::</span>}
            <h3 className="font-semibold">{assignment.title}</h3>
            <Badge variant={assignment.is_active ? "default" : "secondary"}>
              {assignment.is_active ? "Active" : "Inactive"}
            </Badge>
            {!assignment.course_id && <Badge variant="outline">Standalone</Badge>}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Repeat2 className="w-3 h-3" /> {assignment.target_score} correct to finish
            </span>
            <span>−{assignment.wrong_penalty} per wrong answer</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Switch checked={assignment.is_active} onCheckedChange={onToggleActive} className="mr-1" />
          <Button variant="ghost" size="sm" onClick={onEdit}><Pencil className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" onClick={onDelete}><Trash2 className="w-4 h-4 text-destructive" /></Button>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
        <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <code className="text-xs text-muted-foreground flex-1 truncate">{studentLink}</code>
        <Button variant="ghost" size="sm" onClick={copyLink} className="flex-shrink-0 h-7">
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          <span className="ml-1 text-xs">{copied ? "Copied!" : "Copy"}</span>
        </Button>
      </div>

      <div className="border-t -mx-4 -mb-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50/50 transition-colors"
        >
          <Users className="w-4 h-4" />
          View Submissions
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {expanded && (
          <div className="px-4 pb-4 pt-1 border-t">
            <LoopSubmissionViewer assignment={assignment} />
          </div>
        )}
      </div>
    </div>
  );
}
