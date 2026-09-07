import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X, Loader2, Terminal } from "lucide-react";
import { videoEmbedUrl, looksLikeImageUrl } from "@/lib/videoEmbed";

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

  // One box for both, because "paste a link" is the same gesture either way and
  // a teacher should not have to know which of two fields a URL belongs in. A
  // link ending in an image extension is stored as an image so it renders as a
  // picture; pasting one into a video-only box used to produce a `kind: video`
  // item that got iframed as if it were a player.
  const addLink = () => {
    const url = videoUrl.trim();
    if (!url) return;
    setError("");
    const kind = looksLikeImageUrl(url) ? "image" : "video";
    onChange([...items, { kind, url, caption: "" }]);
    setVideoUrl("");
  };

  // Console output pasted as text. Preferable to a screenshot for the terminal
  // programs this course is almost entirely made of - see the note on
  // SampleText in SampleOutputs.jsx.
  const addText = () => {
    setError("");
    onChange([...items, { kind: "text", text: "", caption: "" }]);
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
        The program's output pasted as text, a screenshot of it running, or a link to a video.
        Students see these with the directions. Add as many as you need &mdash; an opening state and
        a win, say. For a console program, pasted text beats a screenshot: it stays selectable,
        scales with the student's font size, and cannot break the way a linked image can.
      </p>

      {items.length > 0 && (
        <div className="space-y-2 pt-1">
          {items.map((s, i) => (
            <div key={i} className="flex items-start gap-2 border rounded-lg p-2 bg-slate-50/60">
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {s.kind === "text" ? "Text" : s.kind === "video" ? "Video" : "Image"}
                  </Badge>
                  {s.kind === "text" ? (
                    <span className="text-xs text-muted-foreground">
                      {(s.text || "").trim()
                        ? `${(s.text || "").split("\n").length} lines of output`
                        : "Paste the program's output below"}
                    </span>
                  ) : s.kind === "image" ? (
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

                {s.kind === "text" && (
                  <Textarea
                    value={s.text || ""}
                    onChange={(e) => updateItem(i, { text: e.target.value })}
                    placeholder={"Guess 1:\n        First num: 3\nYou have 1 correct position(s)..."}
                    rows={8}
                    className="font-mono text-xs whitespace-pre"
                    spellCheck={false}
                  />
                )}
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
                {/* A Drive embed only works for people who can already open the
                    file. Nothing here can check that - the frame is
                    cross-origin - so the reminder is the best we can do, and
                    it is worth making: a file left on "restricted" renders
                    Google's own 401 page inside the assignment. */}
                {/drive\.google\.com/.test(s.url || "") && (
                  <p className="text-xs text-amber-700">
                    Drive link &mdash; students only see this if the file is shared
                    &ldquo;Anyone with the link&rdquo;. Otherwise they get a Google error in place of
                    the sample.
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
        <Button variant="outline" size="sm" onClick={addText}>
          <Terminal className="w-3.5 h-3.5 mr-1.5" /> Paste output text
        </Button>
        <div className="flex items-center gap-1.5">
          <Input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLink()}
            placeholder="...or paste a video or image link"
            className="h-9 w-64 text-sm"
          />
          <Button variant="outline" size="sm" onClick={addLink} disabled={!videoUrl.trim()}>
            Add
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
