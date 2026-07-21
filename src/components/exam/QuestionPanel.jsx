import React from "react";
import HighlightableText from "./HighlightableText";

export default function QuestionPanel({ question, currentPartId, submissionId }) {
  const contentType = question.content_type || "rich_text";

  return (
    <div className="flex-1 overflow-y-auto bg-[hsl(225,20%,97%)] flex flex-col">
      <div className="flex-1 px-4 py-4 flex flex-col gap-4">
        <div className="bg-white rounded shadow-sm border border-slate-200 p-6 flex-1">

          {contentType === "images" && question.prompt_images?.length > 0 ? (
            <div className="space-y-6">
              {question.prompt_images.map((url, i) => {
                if (url.startsWith("__html__:")) {
                  return (
                    <HighlightableText
                      key={i}
                      html={url.slice("__html__:".length)}
                      sessionKey={`${submissionId || "exam"}_q${question.id}_img${i}`}
                    />
                  );
                }
                if (!/\.pdf($|\?|#)/i.test(url) && !url.includes("application/pdf")) {
                  return (
                    <img
                      key={i}
                      src={url}
                      alt={`Question diagram ${i + 1}`}
                      className="w-full max-w-2xl rounded border border-slate-200"
                    />
                  );
                }
                return (
                  <iframe
                    key={i}
                    src={url}
                    className="w-full h-[700px] rounded border border-slate-200"
                    title={`Question PDF ${i + 1}`}
                  />
                );
              })}
            </div>
          ) : contentType === "rich_text" && question.prompt_html ? (
            <HighlightableText
              html={`<div class="quill-render prose prose-sm max-w-none">${question.prompt_html}</div>`}
              sessionKey={`${submissionId || "exam"}_q${question.id}_rt`}
            />
          ) : question.prompt ? (
            <div className="leading-relaxed whitespace-pre-wrap font-mono">
              {question.prompt}
            </div>
          ) : (
            <p className="text-slate-400 italic">No question content.</p>
          )}
        </div>

        {question.parts && question.parts.length > 0 && (
          <div className="bg-white rounded shadow-sm border border-slate-200 p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Parts
            </h3>
            <div className="flex flex-wrap gap-2">
              {question.parts.map((p) => (
                <div
                  key={p.id}
                  className={`text-sm px-3 py-1 rounded-full border transition-colors ${
                    currentPartId === p.id
                      ? "bg-primary text-white border-primary font-semibold"
                      : "text-slate-600 border-slate-200"
                  }`}
                >
                  Part {p.label.toUpperCase()}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}