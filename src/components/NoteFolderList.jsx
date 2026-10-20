import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react";
import { groupNotesByUnit } from "@/lib/noteFolders";

// A student's Class Notes, grouped into one folder per unit. Shared by the
// real student dashboard and the teacher's "View as Student" preview so the
// two can't drift. A class whose notes are all unfiled shows exactly the
// plain list it always did - no lone "Other Notes" heading over everything.
// Every folder starts closed (and isn't remembered between visits) so a
// year's worth of notes is a short list of unit names, not a wall of rows.
export default function NoteFolderList({ notes, units, courses, showCourse, onOpen }) {
  const folders = groupNotesByUnit(notes, units, { courses });
  const [open, setOpen] = useState(() => new Set());
  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const flat = folders.length === 1 && !folders[0].unit;

  const rows = (list) => (
    <div className="space-y-2">
      {list.map((note) => (
        <button
          key={note.id}
          onClick={() => onOpen(note)}
          className="w-full text-left bg-white border rounded-xl p-4 hover:shadow-md hover:border-primary/30 transition-all flex items-center justify-between gap-4"
        >
          <span className="font-medium">{note.title}</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </button>
      ))}
    </div>
  );

  if (flat) return rows(folders[0].notes);

  return (
    <div className="space-y-2">
      {folders.map((f) => {
        const isOpen = open.has(f.key);
        return (
          <div key={f.key}>
            <button
              onClick={() => toggle(f.key)}
              className="w-full flex items-center gap-2 flex-wrap text-left bg-white border rounded-xl px-4 py-3 hover:border-primary/30 transition-colors"
            >
              {isOpen ? <FolderOpen className="w-4 h-4 text-amber-500" /> : <Folder className="w-4 h-4 text-amber-500" />}
              <h3 className="text-sm font-medium">{f.label}</h3>
              {showCourse && f.course && <span className="text-xs text-muted-foreground">{f.course}</span>}
              <Badge variant="outline" className="text-xs">{f.notes.length}</Badge>
              <span className="ml-auto text-muted-foreground">
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </span>
            </button>
            {isOpen && <div className="mt-2 ml-6">{rows(f.notes)}</div>}
          </div>
        );
      })}
    </div>
  );
}
