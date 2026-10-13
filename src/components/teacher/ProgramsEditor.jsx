import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";

// The list of programs a sketch assignment asks for - a problem set of mini
// programs instead of one big one. Left empty it is a single-program assignment,
// exactly as sketches have always been.
//
// Each program keeps the same id for life (it is what a student's code and your
// per-program scores are filed under), so renaming or reordering is always safe;
// only deleting one orphans work already turned in against it.

const newId = () => `p_${Math.random().toString(36).slice(2, 8)}`;
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export default function ProgramsEditor({ value, onChange }) {
  const parts = value || [];
  const [uploading, setUploading] = useState({}); // programId -> count in flight
  const [errors, setErrors] = useState({}); // programId -> message
  const pickers = useRef({});

  // Pasting a screenshot (or dropping / choosing an image) uploads it and files
  // it under that program, shown as a thumbnail below the text box. The text box
  // itself stays plain text, so the description is still just words.
  const addImages = async (i, files) => {
    const part = parts[i];
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setErrors((e) => ({ ...e, [part.id]: "" }));
    let urls = [...(part.images || [])];
    for (const file of list) {
      if (!IMAGE_TYPES.includes(file.type)) { setErrors((e) => ({ ...e, [part.id]: `${file.type || "That"} images aren't supported - use PNG, JPG, GIF or WebP.` })); continue; }
      if (file.size > MAX_IMAGE_BYTES) { setErrors((e) => ({ ...e, [part.id]: "That image is over 5 MB." })); continue; }
      if (urls.length >= MAX_IMAGES) { setErrors((e) => ({ ...e, [part.id]: `At most ${MAX_IMAGES} images per program.` })); break; }
      setUploading((u) => ({ ...u, [part.id]: (u[part.id] || 0) + 1 }));
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        urls = [...urls, file_url];
        // Uses the latest list each time so two quick pastes don't overwrite each other.
        onChange((prev) => (prev || []).map((p) => (p.id === part.id ? { ...p, images: urls } : p)));
      } catch (err) {
        setErrors((e) => ({ ...e, [part.id]: err.message || "Couldn't upload that image." }));
      } finally {
        setUploading((u) => ({ ...u, [part.id]: Math.max(0, (u[part.id] || 1) - 1) }));
      }
    }
  };

  const update = (i, patch) => onChange(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const removeImage = (i, url) => update(i, { images: (parts[i].images || []).filter((u) => u !== url) });
  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= parts.length) return;
    const next = [...parts];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const total = parts.length > 0 && parts.every((p) => p.points !== "" && p.points != null && !Number.isNaN(Number(p.points)))
    ? parts.reduce((sum, p) => sum + Number(p.points), 0)
    : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Programs {parts.length > 0 && <span className="text-muted-foreground font-normal">({parts.length})</span>}</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...parts, { id: newId(), title: "", description: "", points: "" }])}>
          <Plus className="w-4 h-4 mr-1.5" /> Add program
        </Button>
      </div>

      {parts.length === 0 ? (
        <p className="text-xs text-muted-foreground border rounded-lg p-3 bg-slate-50/50">
          One program per student - the usual case. Add programs here when this is a <strong>problem set</strong>:
          students get a tab for each, you score and comment on each separately, and the total is added up for you.
        </p>
      ) : (
        <div className="space-y-2">
          {parts.map((p, i) => (
            <div key={p.id} className="border rounded-lg p-3 space-y-2 bg-slate-50/40">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground w-5 text-right">{i + 1}.</span>
                <Input
                  value={p.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  placeholder={`Program ${i + 1} title, e.g. Bouncing ball`}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min="0"
                  value={p.points ?? ""}
                  onChange={(e) => update(i, { points: e.target.value })}
                  placeholder="pts"
                  className="w-20"
                  title="Points this program is worth (optional)"
                />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, 1)} disabled={i === parts.length - 1} title="Move down">
                  <ArrowDown className="w-4 h-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onChange(parts.filter((_, j) => j !== i))} title="Remove">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <Textarea
                value={p.description || ""}
                onChange={(e) => update(i, { description: e.target.value })}
                onPaste={(e) => {
                  // A screenshot on the clipboard becomes an image on this
                  // program; ordinary text pastes as usual.
                  const imgs = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith("image/"));
                  if (imgs.length > 0) { e.preventDefault(); addImages(i, imgs); }
                }}
                onDrop={(e) => {
                  const imgs = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith("image/"));
                  if (imgs.length > 0) { e.preventDefault(); addImages(i, imgs); }
                }}
                placeholder={"Instructions for this program - steps, requirements, tips. Shown to students right beside the sample output, above their code.\n\nMarkdown works (- bullets, **bold**). Paste a screenshot here to add the sample output."}
                className="text-sm min-h-[88px]"
              />
              {((p.images || []).length > 0 || uploading[p.id] > 0) && (
                <div className="flex flex-wrap gap-2">
                  {(p.images || []).map((url) => (
                    <div key={url} className="relative group">
                      <img src={url} alt="" className="h-24 max-w-[220px] object-contain rounded border bg-white" />
                      <button
                        type="button"
                        onClick={() => removeImage(i, url)}
                        className="absolute -top-1.5 -right-1.5 bg-white border rounded-full p-0.5 shadow text-muted-foreground hover:text-destructive"
                        title="Remove this image"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {uploading[p.id] > 0 && (
                    <div className="h-24 w-24 rounded border border-dashed flex items-center justify-center text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => pickers.current[p.id]?.click()}>
                  <ImagePlus className="w-3.5 h-3.5 mr-1.5" /> Add image
                </Button>
                <input
                  ref={(el) => { pickers.current[p.id] = el; }}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  multiple
                  hidden
                  onChange={(e) => { addImages(i, e.target.files); e.target.value = ""; }}
                />
                {errors[p.id] && <span className="text-xs text-destructive">{errors[p.id]}</span>}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            {total != null ? `Worth ${total} points in total. ` : "Give every program points to get a total out of. "}
            Removing a program hides any code students already wrote for it.
          </p>
        </div>
      )}
    </div>
  );
}
