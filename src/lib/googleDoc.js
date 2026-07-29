export function extractGoogleDocId(url) {
  const m = (url || "").match(/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// Google's own read-only embed view - works for any doc shared as "Anyone
// with the link - Viewer", no separate "publish to web" step required.
export function googleDocEmbedUrl(url) {
  const id = extractGoogleDocId(url);
  return id ? `https://docs.google.com/document/d/${id}/preview` : null;
}
