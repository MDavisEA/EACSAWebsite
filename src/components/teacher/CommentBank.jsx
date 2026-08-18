import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquarePlus, Plus, Trash2, Search } from "lucide-react";

// A bank of reusable comments, attached to whichever feedback field is being
// written. The whole point is speed: if inserting a saved comment costs more
// clicks than retyping it, nobody uses it. So one click inserts, and there is
// a one-click "save this" on whatever is already in the box.
//
// `value`/`onChange` are the field being edited, so this component appends to
// it rather than owning the text.
//
// `scope` ties saved comments to the one piece of work being graded right now
// - {assignment_id}, {coding_problem_id}, or {project_id} - so a remark saved
// while grading one Coding Assignment does not show up while grading a
// different one, or an FRQ. The list here always also includes the teacher's
// "use everywhere" comments (see the Comments page on the dashboard), unioned
// in by the server; a small "Everywhere" tag distinguishes those in the list
// so it is clear why a comment is showing up outside the current scope.
export default function CommentBank({ value, onChange, compact = false, scope = {} }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(!compact);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const scopeKey = scope.assignment_id || scope.coding_problem_id || scope.project_id || "";
  useEffect(() => { load(); }, [scopeKey]);

  const load = async () => {
    setLoading(true);
    try {
      setComments(await base44.entities.Teacher.listComments(scope));
    } catch {
      // A failure here should never block grading - the field still works.
      setComments([]);
    } finally {
      setLoading(false);
    }
  };

  const isGlobal = (c) => !c.assignment_id && !c.coding_problem_id && !c.project_id;

  const insert = (c) => {
    const existing = (value || "").trim();
    // Appended rather than replacing, so several saved remarks can stack up
    // into one piece of feedback.
    onChange(existing ? `${existing} ${c.body}` : c.body);
    base44.entities.Teacher.usedComment(c.id);
    setComments((prev) =>
      [...prev]
        .map((x) => (x.id === c.id ? { ...x, use_count: (x.use_count || 0) + 1 } : x))
        .sort((a, b) => (b.use_count || 0) - (a.use_count || 0))
    );
  };

  const saveCurrent = async () => {
    const text = (value || "").trim();
    if (!text) return;
    setBusy(true);
    try {
      await base44.entities.Teacher.createComment(text, scope);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setBusy(true);
    try {
      await base44.entities.Teacher.deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setBusy(false);
    }
  };

  const shown = query.trim()
    ? comments.filter((c) => c.body.toLowerCase().includes(query.trim().toLowerCase()))
    : comments;

  const alreadySaved = comments.some((c) => c.body === (value || "").trim());

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {compact && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(!open)}>
            <MessageSquarePlus className="w-3.5 h-3.5 mr-1" />
            {open ? "Hide saved comments" : `Saved comments${comments.length ? ` (${comments.length})` : ""}`}
          </Button>
        )}
        {(value || "").trim() && !alreadySaved && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={saveCurrent}
            disabled={busy}
            title="Save what you just wrote for reuse"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Save for reuse
          </Button>
        )}
      </div>

      {open && (
        <div className="border rounded-lg bg-slate-50/60 p-2 space-y-2">
          {comments.length > 6 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter saved comments..."
                className="h-7 text-xs pl-7"
              />
            </div>
          )}

          {loading ? (
            <p className="text-xs text-muted-foreground px-1">Loading...</p>
          ) : shown.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1">
              {comments.length === 0
                ? "No saved comments yet. Write feedback below, then hit Save for reuse."
                : "Nothing matches that."}
            </p>
          ) : (
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {shown.map((c) => (
                <div key={c.id} className="flex items-start gap-1 group">
                  <button
                    onClick={() => insert(c)}
                    className="flex-1 flex items-start gap-1.5 text-left text-xs bg-white border rounded px-2 py-1.5 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                    title="Click to add to the feedback below"
                  >
                    <span className="flex-1">{c.body}</span>
                    {isGlobal(c) && (
                      <span
                        className="flex-shrink-0 text-[10px] uppercase tracking-wide text-slate-400 border rounded px-1 py-0.5"
                        title="Saved to show up everywhere you grade, not just here"
                      >
                        Everywhere
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => remove(c.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-destructive"
                    title="Remove from bank"
                    disabled={busy}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
