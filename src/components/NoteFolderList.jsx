import React from "react";
import { ChevronRight, Folder } from "lucide-react";
import { groupNotesByUnit } from "@/lib/noteFolders";

// A student's Class Notes, grouped into one folder per unit. Shared by the
// real student dashboard and the teacher's "View as Student" preview so the
// two can't drift. A class whose notes are all unfiled shows exactly the
// plain list it always did - no lone "Other Notes" heading over everything.
export default function NoteFolderList({ notes, units, courses, showCourse, onOpen }) {
  const folders = groupNotesByUnit(notes, units, { courses });
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
    <div className="space-y-4">
      {folders.map((f) => (
        <div key={f.key}>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Folder className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-medium">{f.label}</h3>
            {showCourse && f.course && <span className="text-xs text-muted-foreground">{f.course}</span>}
          </div>
          {rows(f.notes)}
        </div>
      ))}
    </div>
  );
}
