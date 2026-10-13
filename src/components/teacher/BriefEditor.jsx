import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, Loader2, X } from "lucide-react";

// Instructions plus sample-output screenshots for one program - or for the whole
// assignment when it is a single program. Students see them side by side in the
// Code view (SketchWorkspace's ProgramBrief), so nobody flips to the Assignment
// tab to remember what they were asked to build.
//
// `value` is { description, images }. `onChange` always receives an UPDATER
// function (prev => next): an image finishes uploading some time after it was
// pasted, and applying the result to the latest value (not the one captured when
// the paste happened) is what stops two quick pastes overwriting each other.

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export default function BriefEditor({ value, onChange, placeholder, rows = 3 }) {
  const images = value?.images || [];
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");
  const picker = useRef(null);

  // A pasted screenshot (or a dropped / chosen image) is uploaded and shown as a
  // thumbnail under the box. The box itself stays plain text.
  const addImages = async (files) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setError("");
    let count = images.length;
    for (const file of list) {
      if (!IMAGE_TYPES.includes(file.type)) { setError(`${file.type || "That"} images aren't supported - use PNG, JPG, GIF or WebP.`); continue; }
      if (file.size > MAX_IMAGE_BYTES) { setError("That image is over 5 MB."); continue; }
      if (count >= MAX_IMAGES) { setError(`At most ${MAX_IMAGES} images here.`); break; }
      count += 1;
      setUploading((n) => n + 1);
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        onChange((prev) => ({ ...prev, images: [...(prev.images || []), file_url] }));
      } catch (err) {
        count -= 1;
        setError(err.message || "Couldn't upload that image.");
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }
  };

  const imagesFromClipboard = (dt) => Array.from(dt?.files || []).filter((f) => f.type.startsWith("image/"));

  return (
    <div className="space-y-2">
      <Textarea
        value={value?.description || ""}
        onChange={(e) => onChange((prev) => ({ ...prev, description: e.target.value }))}
        onPaste={(e) => {
          const imgs = imagesFromClipboard(e.clipboardData);
          if (imgs.length > 0) { e.preventDefault(); addImages(imgs); }
        }}
        onDrop={(e) => {
          const imgs = imagesFromClipboard(e.dataTransfer);
          if (imgs.length > 0) { e.preventDefault(); addImages(imgs); }
        }}
        placeholder={placeholder}
        rows={rows}
        className="text-sm min-h-[88px]"
      />
      {(images.length > 0 || uploading > 0) && (
        <div className="flex flex-wrap gap-2">
          {images.map((url) => (
            <div key={url} className="relative group">
              <img src={url} alt="" className="h-24 max-w-[220px] object-contain rounded border bg-white" />
              <button
                type="button"
                onClick={() => onChange((prev) => ({ ...prev, images: (prev.images || []).filter((u) => u !== url) }))}
                className="absolute -top-1.5 -right-1.5 bg-white border rounded-full p-0.5 shadow text-muted-foreground hover:text-destructive"
                title="Remove this image"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {uploading > 0 && (
            <div className="h-24 w-24 rounded border border-dashed flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => picker.current?.click()}>
          <ImagePlus className="w-3.5 h-3.5 mr-1.5" /> Add image
        </Button>
        <input
          ref={picker}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          hidden
          onChange={(e) => { addImages(e.target.files); e.target.value = ""; }}
        />
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}
