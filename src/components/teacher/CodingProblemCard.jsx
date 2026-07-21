import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, CopyPlus, Code2, EyeOff, Link2, Users, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import CodingSubmissionViewer from "./CodingSubmissionViewer";

export default function CodingProblemCard({ problem, onEdit, onDelete, onToggleActive, onDuplicate }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const testCount = problem.test_cases?.length || 0;
  const hiddenCount = problem.test_cases?.filter((tc) => tc.hidden).length || 0;
  const studentLink = `${window.location.origin}/code?id=${problem.id}`;

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
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold">{problem.title}</h3>
                <Badge variant={problem.is_active ? "default" : "secondary"}>
                  {problem.is_active ? "Active" : "Inactive"}
                </Badge>
                <Badge variant="outline">
                  {problem.harness_type === "exact_match" ? "Exact match" : "Property check"}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-mono">
                  <Code2 className="w-3 h-3" /> {problem.class_name}.{problem.method_name}()
                </span>
                <span>
                  {testCount} test{testCount !== 1 ? "s" : ""}
                </span>
                {hiddenCount > 0 && (
                  <span className="flex items-center gap-1">
                    <EyeOff className="w-3 h-3" /> {hiddenCount} hidden
                  </span>
                )}
                <span>{problem.points_possible ?? 0} pts</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Switch checked={problem.is_active} onCheckedChange={onToggleActive} className="mr-2" />
              <Button variant="ghost" size="sm" onClick={onDuplicate} title="Duplicate problem">
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
              <CodingSubmissionViewer problem={problem} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
