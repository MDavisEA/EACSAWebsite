import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";

// Units and sections are the same shape - an ordered list of names inside a
// course - so they share one editor rather than two near-identical ones that
// would drift apart.
export default function NamedListEditor({ title, hint, items, emptyText, onCreate, onRename, onDelete }) {
  const [adding, setAdding] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message || "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const name = adding.trim();
    if (!name) return;
    run(async () => {
      await onCreate(name);
      setAdding("");
    });
  };

  const saveRename = () => {
    const name = editingName.trim();
    if (!name) return;
    run(async () => {
      await onRename(editingId, name);
      setEditingId(null);
    });
  };

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{emptyText}</p>
      ) : (
        <div className="space-y-1">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-2">
              {editingId === it.id ? (
                <>
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveRename()}
                    className="h-8 text-sm"
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" onClick={saveRename} disabled={busy}>
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm flex-1">{it.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setEditingId(it.id); setEditingName(it.name); }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => run(() => onDelete(it.id))} disabled={busy}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={`Add a ${title.toLowerCase().replace(/s$/, "")}...`}
          className="h-8 text-sm"
        />
        <Button size="sm" variant="outline" onClick={add} disabled={busy || !adding.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
