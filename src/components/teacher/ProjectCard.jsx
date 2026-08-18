import React, { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, CopyPlus, Link2, Users, ChevronDown, ChevronUp, Copy, Check , GripVertical, Ban } from "lucide-react";
import ProjectSubmissionViewer from "./ProjectSubmissionViewer";

export default function ProjectCard({ project, dragHandleProps, ungradedCount = 0, onEdit, onDelete, onToggleActive, onToggleGrading, onDuplicate }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const studentLink = `${window.location.origin}/project?id=${project.id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(studentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-start gap-2">
              {dragHandleProps && (
                <div
                  {...dragHandleProps}
                  className="flex items-center self-center cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0"
                  title="Drag to reorder"
                >
                  <GripVertical className="w-5 h-5" />
                </div>
              )}
              <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold">{project.title}</h3>
                <Badge variant={project.is_active ? "default" : "secondary"}>
                  {project.is_active ? "Active" : "Inactive"}
                </Badge>
                {project.grading_skipped ? (
                  <Badge variant="outline" className="text-slate-500">Not grading this</Badge>
                ) : (
                  ungradedCount > 0 && (
                    <Badge className="bg-amber-500 hover:bg-amber-500 text-white">
                      {ungradedCount} to review
                    </Badge>
                  )
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{project.rubric_md ? "Rubric set" : "No rubric yet"}</span>
                {project.due_date && (
                  <span>Due {format(new Date(project.due_date), "MMM d, h:mm a")}</span>
                )}
                {(project.starter_files || []).length > 0 && (
                  <span>
                    {project.starter_files.length} starter file
                    {project.starter_files.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Switch checked={project.is_active} onCheckedChange={onToggleActive} className="mr-2" />
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleGrading}
                title={project.grading_skipped ? "Grade this project again" : "Don't grade this project"}
                className={project.grading_skipped ? "text-slate-700" : "text-slate-300 hover:text-slate-600"}
              >
                <Ban className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onDuplicate} title="Duplicate project">
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
              <ProjectSubmissionViewer project={project} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
