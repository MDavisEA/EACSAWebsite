import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GripVertical } from "lucide-react";

// Units get their own reorder surface rather than being dragged in place.
// Each unit on the main screen contains a droppable list of its work, and this
// drag library does not support a droppable nested inside a draggable - the
// outer drag silently never starts. A flat list of names has no nesting, so
// dragging actually works here, and it is easier to reorder ten units in one
// short list than by hauling whole sections past each other anyway.
export default function ReorderUnitsDialog({ open, onOpenChange, units, onSave }) {
  const [order, setOrder] = useState(units);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setOrder(units);
  }, [open, units]);

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const next = [...order];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setOrder(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(order.map((u) => u.id));
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reorder units</DialogTitle>
          <DialogDescription>
            Drag to set the order students and you see them in.
          </DialogDescription>
        </DialogHeader>

        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="unit-order">
            {(drop) => (
              <div ref={drop.innerRef} {...drop.droppableProps} className="space-y-2">
                {order.map((u, i) => (
                  <Draggable key={u.id} draggableId={u.id} index={i}>
                    {(drag, snap) => (
                      <div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        {...drag.dragHandleProps}
                        className={`flex items-center gap-2 border rounded-lg px-3 py-2 bg-white cursor-grab active:cursor-grabbing ${
                          snap.isDragging ? "shadow-lg" : ""
                        }`}
                      >
                        <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
                        <span className="text-sm">{u.name}</span>
                      </div>
                    )}
                  </Draggable>
                ))}
                {drop.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save order"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
