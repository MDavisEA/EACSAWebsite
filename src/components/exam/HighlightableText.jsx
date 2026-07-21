import React, { useEffect, useRef, useState, useCallback } from "react";
import { Trash2, Underline } from "lucide-react";

const HIGHLIGHT_COLORS = [
  { name: "yellow", bg: "#FFE566", border: "#F5C800" },
  { name: "blue",   bg: "#A8D4F5", border: "#5AABF0" },
  { name: "pink",   bg: "#F7A8C4", border: "#F06292" },
];

export default function HighlightableText({ html, sessionKey, scale }) {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const [toolbar, setToolbar] = useState(null);
  const savedRange = useRef(null);

  const storageKey = sessionKey || `hl_${html?.length || 0}`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        container.innerHTML = saved;
        reattachRemoveHandlers(container);
      }
    } catch {}
  }, [storageKey]);

  const saveToSession = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    try {
      sessionStorage.setItem(storageKey, container.innerHTML);
    } catch {}
  }, [storageKey]);

  function reattachRemoveHandlers(container) {
    container.querySelectorAll("mark[data-highlight]").forEach((mark) => {
      mark.addEventListener("click", () => removeAnnotation(mark));
    });
    container.querySelectorAll("span[data-underline]").forEach((span) => {
      span.addEventListener("click", () => removeAnnotation(span));
    });
  }

  function removeAnnotation(el) {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    parent.normalize();
    saveToSession();
  }

  useEffect(() => {
    const hide = (e) => {
      if (e.target.closest(".highlight-toolbar")) return;
      setToolbar(null);
      savedRange.current = null;
    };
    document.addEventListener("mousedown", hide);
    return () => document.removeEventListener("mousedown", hide);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleMouseUp = (e) => {
      if (e.target.closest(".highlight-toolbar")) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setToolbar(null);
        savedRange.current = null;
        return;
      }
      const range = selection.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return;

      const rect = range.getBoundingClientRect();
      const wrapRect = wrapperRef.current?.getBoundingClientRect() || el.getBoundingClientRect();

      savedRange.current = range.cloneRange();

      setToolbar({
        x: rect.left - wrapRect.left + rect.width / 2,
        y: rect.top - wrapRect.top,
      });
    };

    el.addEventListener("mouseup", handleMouseUp);
    return () => el.removeEventListener("mouseup", handleMouseUp);
  }, [html]);

  // Safe highlight: always use extractContents approach to avoid surroundContents errors
  // when selection crosses element boundaries or overlaps existing highlights
  const applyHighlight = (color) => {
    const range = savedRange.current;
    if (!range) return;

    // First remove any existing highlights within the selection range
    const mark = document.createElement("mark");
    mark.dataset.highlight = color.name;
    mark.style.cssText = `background:${color.bg};border-radius:2px;cursor:pointer;`;
    mark.title = "Click to remove";

    try {
      // Extract the contents (handles complex DOM trees safely)
      const fragment = range.extractContents();
      // Unwrap any existing marks inside the fragment
      fragment.querySelectorAll("mark[data-highlight]").forEach((m) => {
        const p = m.parentNode;
        while (m.firstChild) p.insertBefore(m.firstChild, m);
        p.removeChild(m);
      });
      mark.appendChild(fragment);
      range.insertNode(mark);
    } catch {
      return;
    }

    mark.addEventListener("click", () => removeAnnotation(mark));
    window.getSelection().removeAllRanges();
    setToolbar(null);
    savedRange.current = null;
    saveToSession();
  };

  const applyUnderline = () => {
    const range = savedRange.current;
    if (!range) return;

    const span = document.createElement("span");
    span.dataset.underline = "true";
    span.style.cssText = "text-decoration:underline;cursor:pointer;";
    span.title = "Click to remove";

    try {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
    } catch {
      return;
    }

    span.addEventListener("click", () => removeAnnotation(span));
    window.getSelection().removeAllRanges();
    setToolbar(null);
    savedRange.current = null;
    saveToSession();
  };

  const clearSelection = () => {
    window.getSelection().removeAllRanges();
    setToolbar(null);
    savedRange.current = null;
  };

  const isPositioned = html && html.includes('class="pdf-page"');

  // For positioned PDF content, use CSS scale transform (inline font sizes are fixed cqw units).
  // For rich text, use fontSize em scaling on the wrapper.
  const wrapperStyle = scale && scale !== 1
    ? isPositioned
      ? { transformOrigin: "top left", transform: `scale(${scale})`, width: `${(1/scale)*100}%`, marginBottom: `calc(${(scale-1)*100}% * -1)` }
      : { fontSize: `${scale}em` }
    : {};

  return (
    <div ref={wrapperRef} className="highlightable-pdf relative select-text" style={wrapperStyle}>
      {toolbar && (
        <div
          className="highlight-toolbar absolute z-50 flex items-center gap-1 bg-white rounded-full shadow-xl border border-slate-200 px-3 py-2"
          style={{
            left: toolbar.x,
            top: toolbar.y,
            transform: "translate(-50%, -100%) translateY(-6px)",
            pointerEvents: "all",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color.name}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => applyHighlight(color)}
              className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 active:scale-95"
              style={{ background: color.bg, borderColor: color.border }}
              title={`Highlight ${color.name}`}
            />
          ))}
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={applyUnderline}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 border border-slate-200"
            title="Underline"
          >
            <Underline className="w-4 h-4 text-slate-600" />
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={clearSelection}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 border border-slate-200"
            title="Dismiss"
          >
            <Trash2 className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        className={isPositioned ? "pdf-positioned-content" : "pdf-extracted-content"}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}