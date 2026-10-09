// Rules for a Processing sketch turned in on the site: its code (tabs of .pde
// text, stored in submissions.files) and its data files (uploaded images etc.,
// stored in Storage and indexed by sketch_assets). Shared by submissions
// (submitSketch) and sketch-assets (upload) so they cannot drift apart. Kept
// free of Deno/Supabase imports so it can be unit tested under plain node.

export const MAX_TABS = 12;
export const MAX_TAB_CHARS = 300_000;
export const MAX_CODE_CHARS = 1_000_000;

export const MAX_ASSET_BYTES = 5 * 1024 * 1024; // per file
export const MAX_ASSETS_TOTAL_BYTES = 25 * 1024 * 1024; // per sketch
export const MAX_ASSET_COUNT = 60;

// Only things a Processing.js sketch can actually use. No SVG: it can carry
// script, and an uploaded file is student-supplied content that other people
// (the teacher) will open. No audio/video: not supported by the runner.
const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  vlw: 'application/octet-stream',
  txt: 'text/plain',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json',
  xml: 'application/xml',
};

export function contentTypeForAsset(name: string): string | null {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return CONTENT_TYPES[ext] ?? null;
}

/**
 * A data file's name as Processing code refers to it: a bare file name, no
 * folders, no leading dot. Returns null when it is not acceptable.
 */
export function cleanAssetName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Strip any path a browser might include; the last segment is the name.
  const name = raw.split(/[\\/]/).pop()!.trim();
  if (!name || name.length > 100) return null;
  if (name.startsWith('.')) return null;
  // Spaces and common punctuation are fine ("Casino Table.jpg"); control
  // characters and anything that could be read as a path are not.
  if (!/^[\p{L}\p{N} _().,'+&-]+$/u.test(name)) return null;
  if (contentTypeForAsset(name) === null) return null;
  return name;
}

export interface SketchFile {
  filename: string;
  content: string;
}

/**
 * Validates and normalizes submitted code tabs. The first tab is the main
 * sketch (Processing names a sketch after its main tab, so order matters).
 */
export function validateSketchFiles(raw: unknown): { files: SketchFile[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'There is no code to turn in.' };
  if (raw.length > MAX_TABS) return { error: `A sketch can have at most ${MAX_TABS} tabs.` };

  const files: SketchFile[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const f of raw) {
    if (!f || typeof f.content !== 'string') return { error: 'One of the tabs could not be read.' };
    let name = typeof f.filename === 'string' ? f.filename.trim() : '';
    name = name.replace(/\.pde$/i, '').replace(/[^A-Za-z0-9_]/g, '_');
    if (!name) name = `tab${files.length + 1}`;
    if (!/^[A-Za-z_]/.test(name)) name = `_${name}`;
    name = name.slice(0, 60);
    const filename = `${name}.pde`;
    if (seen.has(filename.toLowerCase())) return { error: `Two tabs are both named ${filename}.` };
    seen.add(filename.toLowerCase());
    if (f.content.length > MAX_TAB_CHARS) return { error: `${filename} is too long to turn in.` };
    total += f.content.length;
    files.push({ filename, content: f.content });
  }
  if (total > MAX_CODE_CHARS) return { error: 'This sketch is too long to turn in.' };
  if (!files.some((f) => f.content.trim() !== '')) return { error: 'There is no code to turn in.' };
  return { files };
}
