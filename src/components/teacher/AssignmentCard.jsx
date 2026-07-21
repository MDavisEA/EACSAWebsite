import React, { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Copy, Pencil, Trash2, ChevronDown, ChevronUp, Link2, Users, Clock, Check, Star, CopyPlus, GripVertical } from "lucide-react";
import SubmissionViewer from "./SubmissionViewer";

export default function AssignmentCard({ assignment, dragHandleProps, onEdit, onDelete, onToggleActive, onToggleFeatured, onDuplicate, onToggleShowAnswerKey }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const studentLink = `${window.location.origin}/student?id=${assignment.id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(studentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const questionCount = assignment.questions?.length || 0;
  const partCount = assignment.questions?.reduce((sum, q) => sum + (q.parts?.length || 0), 0) || 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div
              {...dragHandleProps}
              className="flex items-center self-center mr-2 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0"
              title="Drag to reorder"
            >
              <GripVertical className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold">{assignment.title}</h3>
                <Badge variant={assignment.is_active ? "default" : "secondary"}>
                  {assignment.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{questionCount} question{questionCount !== 1 ? "s" : ""}</span>
                {partCount > 0 && <span>{partCount} parts</span>}
                {assignment.time_limit_minutes && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {assignment.time_limit_minutes} min
                  </span>
                )}
                {assignment.due_date && (
                  <span>Due: {format(new Date(assignment.due_date), "MMM d, yyyy")}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={onToggleFeatured}
                title={assignment.featured ? "Remove from student landing page" : "Feature on student landing page"}
                className={`p-1.5 rounded transition-colors ${assignment.featured ? "text-amber-400 hover:text-amber-500" : "text-slate-300 hover:text-amber-400"}`}
              >
                <Star className="w-4 h-4" fill={assignment.featured ? "currentColor" : "none"} />
              </button>
              <div className="flex items-center gap-1.5 mr-2 border rounded-md px-2 py-1" title="Show answer key to students on score page">
                <Switch
                  checked={!!assignment.show_answer_key}
                  onCheckedChange={onToggleShowAnswerKey}
                  className="scale-75"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">Show Answers</span>
              </div>
              <Switch
                checked={assignment.is_active}
                onCheckedChange={onToggleActive}
                className="mr-2"
              />
              <Button variant="ghost" size="sm" onClick={onDuplicate} title="Duplicate assignment">
                <CopyPlus className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onDelete}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
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
        </div>

        <div className="border-t">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50/50 transition-colors"
          >
            <Users className="w-4 h-4" />
            View Submissions
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expanded && (
            <div className="px-5 pb-5 border-t">
              <SubmissionViewer assignment={assignment} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}