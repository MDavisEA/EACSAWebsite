import React from "react";
import { Badge } from "@/components/ui/badge";
import { Bot, ExternalLink } from "lucide-react";

// Shown wherever a teacher reviews a submission of a Coding Problem or
// Project - the student's own answer to "did you get AI help", and a link
// to the conversation when they said yes. `null`/`undefined` means the
// submission predates this disclosure existing at all, which has to read
// differently from an explicit "No" - it is not a claim that no AI was used.
export default function AiHelpBadge({ submission }) {
  if (submission.ai_help_used == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (!submission.ai_help_used) {
    return (
      <Badge variant="outline" className="font-normal text-muted-foreground">
        No AI help
      </Badge>
    );
  }
  return (
    <a
      href={submission.ai_help_link}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm text-amber-700 hover:underline"
      title={submission.ai_help_link}
    >
      <Bot className="w-3.5 h-3.5" /> AI help <ExternalLink className="w-3 h-3" />
    </a>
  );
}
