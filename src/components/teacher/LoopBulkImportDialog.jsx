import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// Pastes the JSON array an AI generated from the loop-practice bank prompt
// straight in. Re-pasting an updated batch is safe - the server upserts on
// each item's own "id", so nothing gets duplicated.
export default function LoopBulkImportDialog({ open, onOpenChange, onImport }) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const handleImport = async () => {
    setError("");
    setResult(null);
    let items;
    try {
      items = JSON.parse(raw);
      if (!Array.isArray(items)) throw new Error("Expected a JSON array of problems.");
    } catch (e) {
      setError(`Couldn't parse that as JSON: ${e.message}`);
      return;
    }
    setBusy(true);
    try {
      const res = await onImport(items);
      setResult(res);
      setRaw("");
    } catch (e) {
      setError(e.message || "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Loop Practice Bank</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Paste the JSON array produced by the bank-generation prompt. Existing items with the
            same id are updated in place, not duplicated.
          </p>
          <Textarea
            className="font-mono text-xs min-h-[300px]"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder='[{"id": "for-basic-001", "type": "trace", ...}]'
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          {result && (
            <p className="text-sm text-emerald-700">
              Imported {result.imported ?? result.results?.length ?? 0} problem
              {(result.imported ?? result.results?.length) !== 1 ? "s" : ""}.
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button onClick={handleImport} disabled={busy || !raw.trim()}>
              {busy ? "Importing..." : "Import"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
