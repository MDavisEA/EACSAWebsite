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
  /** Which program of a multi-program assignment this tab belongs to. */
  part?: string;
}

export interface SketchPart {
  id: string;
  title: string;
  description: string;
  points: number | null;
}

export const MAX_PARTS = 30;

/**
 * Cleans the teacher's list of programs. Ids are kept when they are already
 * sound (a renamed part must keep its id - student files and scores point at
 * it) and generated when they are not, and are unique within the list.
 */
export function normalizeParts(raw: unknown): SketchPart[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SketchPart[] = [];
  for (const p of raw.slice(0, MAX_PARTS)) {
    if (!p || typeof p !== 'object') continue;
    let id = typeof p.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(p.id) ? p.id : '';
    while (!id || seen.has(id)) id = `p_${Math.random().toString(36).slice(2, 8)}`;
    seen.add(id);
    const title = typeof p.title === 'string' ? p.title.trim().slice(0, 120) : '';
    const points = Number(p.points);
    out.push({
      id,
      title: title || `Program ${out.length + 1}`,
      description: typeof p.description === 'string' ? p.description.slice(0, 20000) : '',
      points: p.points !== null && p.points !== '' && Number.isFinite(points) && points >= 0 ? points : null,
    });
  }
  return out;
}

function cleanTabName(raw: unknown, fallback: string): string {
  let name = typeof raw === 'string' ? raw.trim() : '';
  name = name.replace(/\.pde$/i, '').replace(/[^A-Za-z0-9_]/g, '_');
  if (!name) name = fallback;
  if (!/^[A-Za-z_]/.test(name)) name = `_${name}`;
  return name.slice(0, 60);
}

/**
 * Validates and normalizes submitted code tabs. The first tab of a program is
 * its main sketch (Processing names a sketch after its main tab, so order
 * matters).
 *
 * With `partIds` (the project has programs) every tab must say which program
 * it belongs to, and is stored as "<part id>/<Tab>.pde" - a path rather than a
 * bare name so two programs can each have a tab called Sketch without colliding
 * in the one `files` list that the grading views, line comments and exports all
 * key by filename. Without `partIds` it is the single-program shape, unchanged.
 */
export function validateSketchFiles(
  raw: unknown,
  partIds?: string[]
): { files: SketchFile[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'There is no code to turn in.' };
  const multi = Array.isArray(partIds) && partIds.length > 0;
  if (raw.length > (multi ? MAX_TABS * partIds!.length : MAX_TABS)) {
    return { error: multi ? 'There are too many tabs in this sketch.' : `A sketch can have at most ${MAX_TABS} tabs.` };
  }

  const tabsByPart = new Map<string, number>();
  const seen = new Set<string>();
  const files: SketchFile[] = [];
  let total = 0;
  for (const f of raw) {
    if (!f || typeof f.content !== 'string') return { error: 'One of the tabs could not be read.' };
    let part: string | undefined;
    if (multi) {
      if (typeof f.part !== 'string' || !partIds!.includes(f.part)) return { error: 'One of the tabs belongs to a program that does not exist.' };
      part = f.part;
      const n = (tabsByPart.get(part) || 0) + 1;
      if (n > MAX_TABS) return { error: `A program can have at most ${MAX_TABS} tabs.` };
      tabsByPart.set(part, n);
    }
    const base = cleanTabName(f.filename, `tab${(part ? tabsByPart.get(part)! : files.length + 1)}`);
    const filename = `${base}.pde`;
    const key = `${part ?? ''}/${filename}`.toLowerCase();
    if (seen.has(key)) return { error: `Two tabs are both named ${filename}.` };
    seen.add(key);
    if (f.content.length > MAX_TAB_CHARS) return { error: `${filename} is too long to turn in.` };
    total += f.content.length;
    files.push(part ? { part, filename: `${part}/${filename}`, content: f.content } : { filename, content: f.content });
  }
  if (total > MAX_CODE_CHARS) return { error: 'This is too long to turn in.' };
  if (!files.some((f) => f.content.trim() !== '')) return { error: 'There is no code to turn in.' };
  if (multi) {
    // Keep the teacher's program order, then the student's tab order within each.
    const order = new Map(partIds!.map((id, i) => [id, i]));
    files.sort((a, b) => (order.get(a.part!)! - order.get(b.part!)!));
  }
  return { files };
}
