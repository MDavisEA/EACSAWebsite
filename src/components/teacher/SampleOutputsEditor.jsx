import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, X, Loader2 } from "lucide-react";
import { videoEmbedUrl } from "@/lib/videoEmbed";

// Editor for a project or coding problem's sample_outputs - screenshots of the
// finished program running, or a link to a video of it. Extracted from
// ProjectForm so a Coding Assignment (which stores the same shape in its own
// sample_outputs column) can offer identical controls instead of a second
// hand-built copy of the upload/add-video/remove logic.
//
// Controlled like any other field: `value` is the array, `onChange` replaces
// it wholesale. Its own local state is only the in-progress upload/video-url
// typing, never the list itself.
export default function SampleOutputsEditor({ value, onChange }) {
  const items = value || [];
  const imageInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState("");

  const handleImageInput = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const uploaded = [];
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        uploaded.push({ kind: "image", url: file_url, caption: "" });
      }
      onChange([...items, ...uploaded]);
    } catch (err) {
      setError(err.message || "Couldn't upload that image.");
    } finally {
      setUploading(false);
    }
  };

  const addVideo = () => {
    const url = videoUrl.trim();
    if (!url) return;
    setError("");
    onChange([...items, { kind: "video", url, caption: "" }]);
    setVideoUrl("");
  };

  const updateItem = (idx, patch) => {
    onChange(items.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const removeItem = (idx) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <Label>Sample output (optional)</Label>
      <p className="text-xs text-muted-foreground">
        Screenshots of the program running, or a link to a video of it. Students see these with the
        directions. Add as many as you need &mdash; an opening state and a win, say.
      </p>

      {items.length > 0 && (
        <div className="space-y-2 pt-1">
          {items.map((s, i) => (
            <div key={i} className="flex items-start gap-2 border rounded-lg p-2 bg-slate-50/60">
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {s.kind === "video" ? "Video" : "Image"}
                  </Badge>
                  {s.kind === "image" ? (
                    <img src={s.url} alt={s.caption || "Sample output"} className="h-12 rounded border bg-white" />
                  ) : (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline truncate"
                    >
                      {s.url}
                    </a>
                  )}
                </div>
                <Input
                  value={s.caption || ""}
                  onChange={(e) => updateItem(i, { caption: e.target.value })}
                  placeholder="Caption (optional) - e.g. 'a winning round'"
                  className="h-8 text-xs"
                />
                {s.kind === "video" && !videoEmbedUrl(s.url) && (
                  <p className="text-xs text-amber-700">
                    Not a YouTube, Loom, or Drive link, so this will show as a link students click
                    rather than a player on the page.
                  </p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeItem(i)} title="Remove">
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={handleImageInput} className="hidden" />
        <Button variant="outline" size="sm" onClick={() => imageInputRef.current?.click()} disabled={uploading}>
          {uploading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Uploading...
            </>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload screenshot
            </>
          )}
        </Button>
        <div className="flex items-center gap-1.5">
          <Input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addVideo()}
            placeholder="...or paste a video link"
            className="h-9 w-64 text-sm"
          />
          <Button variant="outline" size="sm" onClick={addVideo} disabled={!videoUrl.trim()}>
            Add
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
