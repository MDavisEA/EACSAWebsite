import React, { useRef, useCallback } from "react";
import { GripVertical } from "lucide-react";

export default function ResizableDivider({ leftPercent, onResize }) {
  const dragging = useRef(false);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;

    const onMouseMove = (e) => {
      if (!dragging.current) return;
      const container = document.getElementById("exam-split-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newPercent = ((e.clientX - rect.left) / rect.width) * 100;
      onResize(Math.min(Math.max(newPercent, 20), 80));
    };

    const onMouseUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [onResize]);

  return (
    <div
      onMouseDown={onMouseDown}
      className="w-2 flex-shrink-0 bg-slate-200 hover:bg-primary/30 cursor-col-resize flex items-center justify-center group transition-colors select-none z-10"
      title="Drag to resize"
    >
      <div className="w-1 h-12 rounded-full bg-slate-400 group-hover:bg-primary transition-colors flex items-center justify-center">
        <GripVertical className="w-3 h-3 text-slate-500 group-hover:text-primary" />
      </div>
    </div>
  );
}