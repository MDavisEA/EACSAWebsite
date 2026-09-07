import React, { useState } from "react";
import { videoEmbedUrl } from "@/lib/videoEmbed";
import { ExternalLink } from "lucide-react";

// An <img> that falls back to a plain link if the image does not load.
//
// Checked by actually loading it rather than by pattern-matching the URL: an
// uploaded screenshot's URL is not guaranteed to end in .png, so guessing from
// the extension would hide images that work perfectly well. onError only fires
// on a genuine failure - a private Drive link, a deleted upload, a 404 - which
// is exactly when the browser would otherwise draw a broken-image icon.
function SampleImage({ url, alt, borderCls, linkCls }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1.5 text-sm ${linkCls}`}
      >
        Open the sample output <ExternalLink className="w-3.5 h-3.5" />
      </a>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img
        src={url}
        alt={alt}
        onError={() => setFailed(true)}
        className={`max-w-full rounded-lg border ${borderCls} hover:opacity-95 transition-opacity`}
      />
    </a>
  );
}

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
              <SampleImage
                url={s.url}
                alt={s.caption || `Sample output ${i + 1}`}
                borderCls={borderCls}
                linkCls={linkCls}
              />
            ) : embed ? (
              /* An embed that fails - a Drive file that is not shared publicly,
                 say - shows the service's own error page inside the frame, and
                 nothing here can detect that: the frame is cross-origin, so it
                 loads "successfully" as far as this page can tell. The escape
                 hatch is the link underneath, which always opens the original
                 URL in a tab where the student is signed in. */
              <div>
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
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 text-xs mt-1.5 ${linkCls}`}
                >
                  Not loading? Open it in a new tab <ExternalLink className="w-3 h-3" />
                </a>
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
