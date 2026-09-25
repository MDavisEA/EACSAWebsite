import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Folder, FolderOpen, FolderPlus, ChevronDown, ChevronRight, Plus } from "lucide-react";
import NoteCard from "@/components/teacher/NoteCard";
import { groupNotesByUnit } from "@/lib/noteFolders";

// The class's Notes tab: one collapsible folder per unit (the same units the
// Assignments tab shows, so creating a folder here also adds that unit
// there), plus "Other Notes" for anything not filed yet. Every unit is shown
// even when empty, so there is always somewhere visible to file a note into.
export default function NoteFolders({ notes, units, onNewNote, onNewUnit, onEdit, onDelete, onTogglePublished, onMove }) {
  const folders = groupNotesByUnit(notes, units, { includeEmpty: true });
  // Folders with notes in them start open; empty ones start closed so a
  // course with many assignment-only units doesn't bury the notes.
  const [open, setOpen] = useState(() => new Set(folders.filter((f) => f.notes.length > 0).map((f) => f.key)));
  const [addingUnit, setAddingUnit] = useState(false);
  const [unitName, setUnitName] = useState("");

  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const submitUnit = async () => {
    const name = unitName.trim();
    if (!name) return;
    await onNewUnit(name);
    setUnitName("");
    setAddingUnit(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        {addingUnit ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={unitName}
              onChange={(e) => setUnitName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitUnit();
                if (e.key === "Escape") { setAddingUnit(false); setUnitName(""); }
              }}
              placeholder="Unit 3: Loops"
              className="h-9 w-56"
            />
            <Button size="sm" onClick={submitUnit} disabled={!unitName.trim()}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAddingUnit(false); setUnitName(""); }}>Cancel</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAddingUnit(true)}>
            <FolderPlus className="w-4 h-4 mr-1.5" /> New Unit Folder
          </Button>
        )}
        <Button size="sm" onClick={() => onNewNote(null)}>
          <Plus className="w-4 h-4 mr-1.5" /> New Note
        </Button>
      </div>

      {folders.length === 0 ? (
        <div className="text-center text-muted-foreground bg-white border rounded-xl p-10">
          <p className="text-sm">No notes yet for this class.</p>
        </div>
      ) : (
        folders.map((f) => {
          const isOpen = open.has(f.key);
          return (
            <div key={f.key} className="bg-white border rounded-xl">
              <div className="flex items-center gap-2 px-4 py-3">
                <button onClick={() => toggle(f.key)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                  {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  {isOpen ? <FolderOpen className="w-4 h-4 text-amber-500" /> : <Folder className="w-4 h-4 text-amber-500" />}
                  <span className="font-semibold truncate">{f.label}</span>
                  <Badge variant="outline" className="text-xs">{f.notes.length}</Badge>
                </button>
                {f.unit && (
                  <Button size="sm" variant="ghost" onClick={() => onNewNote(f.unit.id)} title={`New note in ${f.label}`}>
                    <Plus className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3">
                  {f.notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground pl-6">No notes in this unit yet.</p>
                  ) : (
                    f.notes.map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        units={units}
                        onEdit={() => onEdit(note)}
                        onDelete={() => onDelete(note)}
                        onTogglePublished={() => onTogglePublished(note)}
                        onMove={(unitId) => onMove(note, unitId)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
