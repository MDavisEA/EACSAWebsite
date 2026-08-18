import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquarePlus, Plus, Trash2, Loader2 } from "lucide-react";

// Manages the "use everywhere" comments - the ones a teacher wants available
// no matter what they are grading, not just the one assignment they saved it
// from. Ordinary comments are saved from inside a grading window itself, and
// only ever apply to that one piece of work (see CommentBank.jsx); this page
// is the one place the everywhere ones are set up, since there is no grading
// window that represents "everything."
export default function GlobalCommentsPanel() {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      // No scope passed = the global set, same as every grading window
      // already sees regardless of what it is grading.
      setComments(await base44.entities.Teacher.listComments());
    } catch (e) {
      setError(e.message || "Couldn't load your comments.");
    } finally {
      setLoading(false);
    }
  };

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError("");
    try {
      await base44.entities.Teacher.createComment(text);
      setDraft("");
      await load();
    } catch (e) {
      setError(e.message || "Couldn't save that.");
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

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Frequently used comments</h3>
            <p className="text-sm text-muted-foreground">
              These show up while grading anything - every Mini Problem, Coding Assignment, FRQ, and
              Project - not just one. A comment you save from inside a grading window only shows up
              for that specific assignment; put it here instead if it is one you would genuinely
              reach for on more or less anything.
            </p>
          </div>

          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. Check your loop bounds"
              rows={2}
            />
            <Button onClick={add} disabled={busy || !draft.trim()}>
              <Plus className="w-4 h-4 mr-1.5" /> Add
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide mb-3">
          Everywhere comments {comments.length > 0 && `(${comments.length})`}
        </h3>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <MessageSquarePlus className="w-4 h-4" /> None yet - anything added above shows up
            while grading anything.
          </p>
        ) : (
          <div className="space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="flex items-start gap-3 bg-white border rounded-xl p-3">
                <p className="text-sm flex-1">{c.body}</p>
                <button
                  onClick={() => remove(c.id)}
                  disabled={busy}
                  className="text-slate-400 hover:text-destructive flex-shrink-0"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
