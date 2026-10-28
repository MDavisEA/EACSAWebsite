import React from "react";
import { ExternalLink } from "lucide-react";
import { loomVideoId, loomEmbedUrl, loomShareUrl } from "@/lib/loom";

// The Loom video attached to a note, as a player plus a plain link out -
// the link matters when the video is restricted to a Loom workspace, where
// the embedded player just asks the student to sign in.
export default function NoteVideo({ url }) {
  const id = loomVideoId(url);
  if (!id) return null;
  return (
    <div className="space-y-1.5">
      <div className="relative w-full overflow-hidden rounded-lg border bg-black" style={{ paddingTop: "56.25%" }}>
        <iframe
          src={loomEmbedUrl(id)}
          title="Loom video"
          className="absolute inset-0 w-full h-full"
          allow="fullscreen"
          allowFullScreen
        />
      </div>
      <a
        href={loomShareUrl(id)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ExternalLink className="w-3 h-3" /> Open in Loom
      </a>
    </div>
  );
}
