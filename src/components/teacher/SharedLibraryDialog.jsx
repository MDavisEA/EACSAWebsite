import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Copy, CheckCircle2 } from "lucide-react";

// Copying is pulled by the recipient rather than pushed by the author: the
// person copying is the one who knows which of their own units it belongs in,
// and it means nobody can drop work into someone else's course. The copy is a
// new row owned by whoever copied it; the original stays untouched.
export default function SharedLibraryDialog({ open, onOpenChange, courses, onCopied }) {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [target, setTarget] = useState({});
  const [copyingId, setCopyingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      setError("");
      setCopiedId(null);
      try {
        setProblems(await base44.entities.CodingProblem.listShared());
      } catch (e) {
        setError(e.message || "Couldn't load shared problems.");
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const copy = async (problem) => {
    const choice = target[problem.id];
    if (!choice) return;
    const [courseId, unitId] = choice.split("::");
    setCopyingId(problem.id);
    setError("");
    try {
      await base44.entities.CodingProblem.copyToMyCourse(problem.id, courseId, unitId || null);
      setCopiedId(problem.id);
      onCopied?.();
    } catch (e) {
      setError(e.message || "Couldn't copy that problem.");
    } finally {
      setCopyingId(null);
    }
  };

  // Flattened course/unit pairs, since a copy needs both at once.
  const destinations = courses.flatMap((c) =>
    (c.units || []).map((u) => ({ value: `${c.id}::${u.id}`, label: `${c.name} · ${u.name}` }))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Problems from other teachers</DialogTitle>
          <DialogDescription>
            Copying makes your own editable copy, filed in one of your units and switched off until
            you are ready. Theirs is not changed and you cannot edit it.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : problems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nobody else has built a problem yet.
          </p>
        ) : destinations.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            You need a course with at least one unit before you can copy anything into it.
          </p>
        ) : (
          <div className="space-y-3">
            {problems.map((p) => (
              <div key={p.id} className="border rounded-xl p-4 space-y-3">
                <div>
                  <p className="font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.courses?.name ? `From ${p.courses.name}` : "From another teacher"}
                    {p.points_possible != null ? ` · ${p.points_possible} pts` : ""}
                  </p>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-slate-500">Copy into</Label>
                    <Select
                      value={target[p.id] || ""}
                      onValueChange={(v) => setTarget((t) => ({ ...t, [p.id]: v }))}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Pick one of your units" />
                      </SelectTrigger>
                      <SelectContent>
                        {destinations.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    variant={copiedId === p.id ? "outline" : "default"}
                    onClick={() => copy(p)}
                    disabled={!target[p.id] || copyingId === p.id}
                  >
                    {copyingId === p.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : copiedId === p.id ? (
                      <><CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-600" /> Copied</>
                    ) : (
                      <><Copy className="w-4 h-4 mr-1.5" /> Copy</>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
