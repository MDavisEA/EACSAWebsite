// Loom links pasted into a note. Mirrors loomShareUrl() in
// supabase/functions/notes/index.ts, which is what actually decides what
// gets saved - this copy is only for live feedback and for building the
// player's iframe src from the saved link.
//
// Accepts a share or embed link, with or without "www.", a title slug in
// front of the id, or a ?sid=/?t= query on the end. Returns null for
// anything that isn't recognizably a Loom video.
export function loomVideoId(url) {
  const m = /^https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/([^/?#\s]+)/i.exec((url || "").trim());
  if (!m) return null;
  const segment = m[1];
  const hex = /([0-9a-f]{32})$/i.exec(segment);
  if (hex) return hex[1].toLowerCase();
  return /^[A-Za-z0-9]{10,64}$/.test(segment) ? segment : null;
}

export const loomEmbedUrl = (id) => `https://www.loom.com/embed/${id}`;
export const loomShareUrl = (id) => `https://www.loom.com/share/${id}`;
