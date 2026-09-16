import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload } from "lucide-react";

// Pastes (or uploads) the JSON array an AI generated from the loop-practice
// bank prompt straight in. Re-importing an updated batch is safe - the
// server upserts on each item's own "id", so nothing gets duplicated.
export default function LoopBulkImportDialog({ open, onOpenChange, onImport }) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again later
    if (!file) return;
    setError("");
    setResult(null);
    try {
      const text = await file.text();
      setRaw(text);
      setFileName(file.name);
    } catch (err) {
      setError(`Couldn't read that file: ${err.message}`);
    }
  };

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
      setFileName("");
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
            Upload or paste the JSON array produced by the bank-generation prompt. Existing items
            with the same id are updated in place, not duplicated.
          </p>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-1.5" /> Upload JSON file
            </Button>
            {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
          </div>
          <Textarea
            className="font-mono text-xs min-h-[300px]"
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setFileName(""); }}
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
