export function extractGoogleDocId(url: string): string | null {
  const m = (url || '').match(/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}
