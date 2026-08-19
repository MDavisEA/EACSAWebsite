import React from "react";
import { videoEmbedUrl } from "@/lib/videoEmbed";
import { ExternalLink } from "lucide-react";

// A project or coding problem's sample_outputs, rendered the same way
// everywhere it's shown - a student on ProjectPage/CodePracticePage, and a
// teacher previewing either via StudentPreviewDialog - extracted so those do
// not drift into slightly different renderings of the same three cases
// (image, embeddable video, link-only video).
//
// `dark` switches the border/caption/link colors for CodePracticePage's
// dark-themed editor panel, which hardcodes slate colors rather than the
// `border-border`/`text-muted-foreground` tokens used everywhere else - those
// tokens are fixed light-theme values, not a real dark-mode toggle, so used
// as-is here they'd render a stark, mismatched light box on a dark panel.
export default function SampleOutputs({ items = [], dark = false }) {
  if (items.length === 0) return null;
  const borderCls = dark ? "border-slate-700" : "border-border";
  const captionCls = dark ? "text-slate-400" : "text-muted-foreground";
  const linkCls = dark ? "text-emerald-400 hover:underline" : "text-primary hover:underline";
  return (
    <div className="space-y-5">
      {items.map((s, i) => {
        const embed = s.kind === "video" ? videoEmbedUrl(s.url) : null;
        return (
          <div key={i}>
            {s.kind === "image" ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={s.url}
                  alt={s.caption || `Sample output ${i + 1}`}
                  className={`max-w-full rounded-lg border ${borderCls} hover:opacity-95 transition-opacity`}
                />
              </a>
            ) : embed ? (
              <div className={`rounded-lg overflow-hidden border ${borderCls} bg-black`}>
                <iframe
                  src={embed}
                  title={s.caption || `Sample output video ${i + 1}`}
                  className="w-full"
                  style={{ aspectRatio: "16 / 9", border: 0 }}
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              /* Not a service we can embed - a plain link, rather than an
                 iframe that would render as an empty box. */
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 text-sm ${linkCls}`}
              >
                Watch the sample output video <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {s.caption && <p className={`text-xs ${captionCls} mt-2`}>{s.caption}</p>}
          </div>
        );
      })}
    </div>
  );
}
