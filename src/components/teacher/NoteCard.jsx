import React, { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";

export default function NoteCard({ note, onEdit, onDelete, onTogglePublished }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{note.title}</h3>
            <Badge variant={note.is_published ? "default" : "secondary"}>
              {note.is_published ? "Published" : "Private"}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Switch checked={note.is_published} onCheckedChange={onTogglePublished} className="mr-2" />
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </div>

        {note.updated_at && (
          <p className="text-xs text-muted-foreground mb-2">
            Updated {format(new Date(note.updated_at), "MMM d, h:mm a")}
          </p>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {expanded ? "Hide" : "Preview"}
        </button>

        {expanded && (
          <div
            className="prose prose-sm max-w-none quill-render quill-dark mt-3 p-4 rounded-lg bg-[#1e1e1e] text-slate-100"
            dangerouslySetInnerHTML={{ __html: note.content_html }}
          />
        )}
      </CardContent>
    </Card>
  );
}
