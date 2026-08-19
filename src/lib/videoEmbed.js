// Turns a normal "copy the link from the address bar" video URL into one that
// can be embedded in an iframe. Same idea as googleDoc.js: teachers paste the
// link they already have, not a special embed URL they would have to go find.
//
// Returns null for anything unrecognized, and callers must fall back to a
// plain link when it does - an <iframe> pointed at a non-embeddable URL renders
// as a blank box or an X-Frame-Options error, which looks like the site is
// broken rather than like the link needs opening in a new tab.
export function videoEmbedUrl(url) {
  const u = (url || "").trim();
  if (!u) return null;

  // youtu.be/ID and youtube.com/watch?v=ID and /shorts/ID
  const yt =
    u.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/) ||
    u.match(/youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{6,})/) ||
    u.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/) ||
    u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;

  // Loom share links - /share/ID is the copy-link form, /embed/ID the embed one
  const loom = u.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;

  // Google Drive video files: /file/d/ID/view -> /preview
  const drive = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;

  return null;
}

// Whether a URL points at an image we can show inline. Used to let a teacher
// paste an image URL instead of uploading, without us trying to <img> something
// that is actually a webpage.
export function looksLikeImageUrl(url) {
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i.test((url || "").trim());
}
