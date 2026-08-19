import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import CommentBank from "./CommentBank";
import { highlightJava, ONE_DARK } from "@/lib/javaHighlight";
import { MessageSquare, Trash2 } from "lucide-react";

// Student code with the teacher's comments pinned to specific lines. Started
// life inside CodeReviewGrader; extracted because "leave a note on line 14" is
// wanted for every kind of work a student turns code in for - a hand-graded
// Coding Assignment, an autograded Mini Problem, and each .java file in a
// Project - and three copies of this would drift apart immediately.
//
// `file` is which file these comments belong to. A Project submission has
// several files, so a comment has to record which one it was left on;
// single-file work passes null and stores nothing, which is also exactly what
// every comment written before Projects had this looks like. That makes the
// old shape [{line, body}] and the new [{file, line, body}] the same thing
// read the same way, with no migration.
//
// Which line is being commented on (`activeLine`) lives inside this
// component, not the caller - so a caller that swaps `code`/`comments` to a
// different submission (Next student, Save & next, switching a file tab)
// without changing this component's `key` reuses the same instance, and an
// open, unsaved draft on line N survives the swap and can be submitted onto
// the next student's line N. Every call site must pass `key` scoped to
// whatever identifies "this specific piece of code" - a submission id, or
// `${submissionId}::${file}` when file tabs are involved.
export default function AnnotatedCodeView({
  code,
  file = null,
  comments = [],
  onAdd,
  onRemove,
  readOnly = false,
  commentScope = {},
  maxHeight = "60vh",
}) {
  const [activeLine, setActiveLine] = useState(null);
  const [draft, setDraft] = useState("");

  const lines = String(code ?? "").split("\n");
  const tokens = highlightJava(code ?? "");

  const mine = comments.filter((c) => (c.file ?? null) === file);
  const commentFor = (n) => mine.find((c) => c.line === n);

  const startEditing = (n, existing) => {
    if (readOnly) return;
    setActiveLine(n);
    setDraft(existing?.body || "");
  };

  const commit = () => {
    const body = draft.trim();
    if (!body || activeLine == null) return;
    onAdd(activeLine, body);
    setDraft("");
    setActiveLine(null);
  };

  return (
    <div
      className="text-xs font-mono overflow-x-auto overflow-y-auto"
      style={{ background: ONE_DARK.bg, color: ONE_DARK.plain, maxHeight }}
    >
      {lines.map((text, i) => {
        const n = i + 1;
        const c = commentFor(n);
        return (
          <div key={n}>
            {/* The whole line is the target, not just the number in the gutter
                - reaching for the code you are commenting on is the instinct,
                and a 40px gutter is a small thing to hit over and over. */}
            <div
              onClick={() => startEditing(n, c)}
              className={`flex group ${readOnly ? "" : "cursor-pointer hover:bg-slate-800"} ${
                c ? "bg-amber-500/10" : ""
              }`}
              title={readOnly ? undefined : c ? "Edit this comment" : "Comment on this line"}
            >
              <span
                className={`w-10 flex-shrink-0 text-right pr-2 select-none border-r border-slate-700 ${
                  c ? "text-amber-400 font-semibold" : "text-slate-500 group-hover:text-slate-300"
                }`}
              >
                {n}
              </span>
              <pre className="px-2 whitespace-pre flex-1">
                {(tokens[i] || []).length === 0
                  ? text || " "
                  : tokens[i].map((t, ti) => (
                      <span
                        key={ti}
                        style={{ color: t.color, fontStyle: t.italic ? "italic" : undefined }}
                      >
                        {t.text}
                      </span>
                    ))}
              </pre>
              {!readOnly && !c && activeLine !== n && (
                <MessageSquare className="w-3 h-3 mr-2 self-center flex-shrink-0 text-slate-500 opacity-0 group-hover:opacity-100" />
              )}
            </div>

            {c && (
              <div className="flex items-start gap-1.5 bg-amber-500/15 border-l-2 border-amber-400 pl-11 pr-2 py-1">
                <MessageSquare className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                <span className="text-amber-100 flex-1">{c.body}</span>
                {!readOnly && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(n); }}
                    className="text-slate-400 hover:text-red-400"
                    title="Remove this line comment"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {activeLine === n && !readOnly && (
              <div className="bg-slate-800 pl-11 pr-2 py-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Comment on line ${n}...`}
                  rows={2}
                  className="text-xs bg-slate-900 border-slate-700 text-slate-100"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={commit}>
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-slate-400"
                    onClick={() => { setActiveLine(null); setDraft(""); }}
                  >
                    Cancel
                  </Button>
                </div>
                <div className="[&_button]:text-slate-300">
                  <CommentBank compact value={draft} onChange={setDraft} scope={commentScope} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
