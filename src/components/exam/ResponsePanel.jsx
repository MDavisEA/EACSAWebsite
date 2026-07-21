import React, { useRef, useCallback, useEffect } from "react";
import { Bookmark } from "lucide-react";
import { highlightJava } from "./JavaHighlighter";

export default function ResponsePanel({
  questionNumber,
  partLabel,
  partPrompt,
  partPromptIsHtml,
  value,
  onChange,
  onBlur
}) {
  const taRef = useRef(null);
  const highlightRef = useRef(null);
  // Track last value we set so we don't clobber user edits when parent re-renders
  const lastExternalValue = useRef(value);

  // Sync highlight layer text
  const updateHighlight = useCallback((text) => {
    if (highlightRef.current) {
      highlightRef.current.innerHTML = highlightJava(text || "") + "\n";
    }
  }, []);

  // When the parent passes a new value (e.g. question navigation), update the textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    // Only overwrite if value genuinely changed from outside (not from our own onChange)
    if (value !== lastExternalValue.current) {
      ta.value = value || "";
      lastExternalValue.current = value || "";
      updateHighlight(value || "");
    }
  }, [value, updateHighlight]);

  // Initial render — set textarea value directly (uncontrolled)
  useEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.value = value || "";
      updateHighlight(value || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncScroll = useCallback(() => {
    if (taRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = taRef.current.scrollTop;
      highlightRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  }, []);

  const handleChange = (e) => {
    const text = e.target.value;
    lastExternalValue.current = text;
    updateHighlight(text);
    onChange(text);
    syncScroll();
  };

  const handleKeyDown = (e) => {
    // Let browser handle undo/redo natively — don't intercept
    if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z" || e.key === "y" || e.key === "Y")) {
      return;
    }

    const ta = e.target;
    const val = ta.value;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      if (start !== end) {
        // Multi-line indent: indent every line in the selection
        const lineStart = val.lastIndexOf("\n", start - 1) + 1;
        const selected = val.substring(lineStart, end);
        const indented = selected.replace(/^/gm, "    ");
        const added = indented.length - selected.length;
        const newVal = val.substring(0, lineStart) + indented + val.substring(end);
        ta.value = newVal;
        lastExternalValue.current = newVal;
        updateHighlight(newVal);
        onChange(newVal);
        requestAnimationFrame(() => {
          ta.selectionStart = start + 4; // shift start by one indent
          ta.selectionEnd = end + added;
        });
      } else {
        const newVal = val.substring(0, start) + "    " + val.substring(end);
        ta.value = newVal;
        lastExternalValue.current = newVal;
        updateHighlight(newVal);
        onChange(newVal);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 4;
        });
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const lineStart = val.lastIndexOf("\n", start - 1) + 1;
      const currentLine = val.substring(lineStart, start);
      const indent = currentLine.match(/^(\s*)/)[1];
      const newVal = val.substring(0, start) + "\n" + indent + val.substring(end);
      ta.value = newVal;
      lastExternalValue.current = newVal;
      updateHighlight(newVal);
      onChange(newVal);
      requestAnimationFrame(() => {
        const newPos = start + 1 + indent.length;
        ta.selectionStart = ta.selectionEnd = newPos;
        syncScroll();
      });
    }

    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      if (start !== end) {
        const lineStart = val.lastIndexOf("\n", start - 1) + 1;
        const fullSelText = val.substring(lineStart, end);
        const afterSel = val.substring(end);
        const unindented = fullSelText.replace(/^    /gm, "").replace(/^\t/gm, "");
        const removed = fullSelText.length - unindented.length;
        const newVal = val.substring(0, lineStart) + unindented + afterSel;
        ta.value = newVal;
        lastExternalValue.current = newVal;
        updateHighlight(newVal);
        onChange(newVal);
        requestAnimationFrame(() => {
          ta.selectionStart = Math.max(lineStart, start - (val.substring(lineStart, start).length - unindented.substring(0, val.substring(lineStart, start).length).length));
          ta.selectionEnd = end - removed;
        });
      } else {
        const lineStart = val.lastIndexOf("\n", start - 1) + 1;
        const lineBeforeCursor = val.substring(lineStart, start);
        if (lineBeforeCursor.startsWith("    ")) {
          const newVal = val.substring(0, lineStart) + lineBeforeCursor.substring(4) + val.substring(start);
          ta.value = newVal;
          lastExternalValue.current = newVal;
          updateHighlight(newVal);
          onChange(newVal);
          requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start - 4; });
        } else if (lineBeforeCursor.startsWith("\t")) {
          const newVal = val.substring(0, lineStart) + lineBeforeCursor.substring(1) + val.substring(start);
          ta.value = newVal;
          lastExternalValue.current = newVal;
          updateHighlight(newVal);
          onChange(newVal);
          requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start - 1; });
        }
      }
    }
  };

  const sharedStyle = {
    fontFamily: '"JetBrains Mono", Consolas, monospace',
    fontSize: "0.875rem",
    lineHeight: "1.625",
    padding: "1rem",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
    tabSize: 4,
    letterSpacing: "normal",
  };

  return (
    <div className="flex flex-col bg-white" style={{ height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <span className="inline-flex items-center justify-center min-w-8 h-8 px-2 rounded bg-slate-800 text-white text-sm font-bold whitespace-nowrap">
            {questionNumber}{partLabel ? partLabel.toUpperCase() : ""}
          </span>
          <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
            <Bookmark className="w-3.5 h-3.5" />
            Mark for Review
          </button>
        </div>

        {partLabel && (
          <div className="mb-2">
            <span className="text-sm font-semibold text-slate-800">
              Part {partLabel.toUpperCase()})
            </span>
          </div>
        )}

        {partPrompt && (
          partPromptIsHtml ? (
            <div
              className="text-sm text-slate-600 leading-relaxed prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: partPrompt }}
            />
          ) : (
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
              {partPrompt}
            </p>
          )
        )}
      </div>

      {/* Editor area */}
      <div className="p-4 flex-1 min-h-0 flex flex-col">
        <div className="border border-slate-300 rounded flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Toolbar */}
          <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 flex-shrink-0">
            <span className="text-xs text-slate-400 font-mono">Java</span>
          </div>

          {/* Overlay editor: highlight div + transparent textarea stacked */}
          <div className="relative flex-1 min-h-0 overflow-hidden bg-white">
            {/* Highlighted layer (read-only, behind) */}
            <div
              ref={highlightRef}
              aria-hidden="true"
              style={{
                ...sharedStyle,
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                pointerEvents: "none",
                color: "#1e293b",
                zIndex: 1,
              }}
            />

            {/* Actual textarea — uncontrolled so browser undo works */}
            <textarea
              ref={taRef}
              style={{
                ...sharedStyle,
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                resize: "none",
                background: "transparent",
                color: "transparent",
                caretColor: "#1e293b",
                border: "none",
                outline: "none",
                zIndex: 2,
                overflowY: "auto",
                overflowX: "auto",
              }}
              onChange={handleChange}
              onScroll={syncScroll}
              onBlur={onBlur}
              onKeyDown={handleKeyDown}
              placeholder=""
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />

            {/* Placeholder shown when empty */}
            {!value && (
              <div
                style={{
                  ...sharedStyle,
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  color: "#94a3b8",
                  zIndex: 0,
                }}
              >
                Type your response here...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}