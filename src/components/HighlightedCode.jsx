import React from "react";
import { highlightJava, ONE_DARK } from "@/lib/javaHighlight";

// A block of read-only Java, syntax-colored the same way a submission's own
// code is (AnnotatedCodeView, SubmissionDetail's CodeWithNotes) - no gutter,
// no line comments, just the code. For an answer key, which has neither.
export default function HighlightedCode({ code, className = "" }) {
  const lines = String(code ?? "").split("\n");
  const tokenLines = highlightJava(code ?? "");
  return (
    <pre
      className={`text-xs font-mono whitespace-pre-wrap ${className}`}
      style={{ background: ONE_DARK.bg, color: ONE_DARK.plain }}
    >
      {lines.map((lineText, i) => (
        <React.Fragment key={i}>
          {(tokenLines[i] || []).length === 0
            ? lineText || " "
            : tokenLines[i].map((t, ti) => (
                <span key={ti} style={{ color: t.color, fontStyle: t.italic ? "italic" : undefined }}>
                  {t.text}
                </span>
              ))}
          {i < lines.length - 1 && "\n"}
        </React.Fragment>
      ))}
    </pre>
  );
}
