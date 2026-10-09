// Helpers for a sketch's data files (the images etc. its code loads by name).
//
// An "asset" in the page's memory is { name, size, kind, dataUrl?, text?, id? }:
//  - kind 'image' carries a data: URL, so the sandboxed iframe can decode it
//    without the canvas ever being tainted by a cross-origin load;
//  - kind 'text' carries its text (for loadStrings);
//  - kind 'other' (a .vlw font) is only a name to the runner - it substitutes a
//    default font, but still needs to know the file exists.

export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
export const MAX_ASSETS_TOTAL_BYTES = 25 * 1024 * 1024;

const IMAGE_EXT = /\.(png|jpe?g|gif|bmp|webp)$/i;
const TEXT_EXT = /\.(txt|csv|tsv|json|xml)$/i;

export const ACCEPT_ATTR = ".png,.jpg,.jpeg,.gif,.bmp,.webp,.vlw,.txt,.csv,.tsv,.json,.xml";

export function kindOfName(name) {
  return IMAGE_EXT.test(name) ? "image" : TEXT_EXT.test(name) ? "text" : "other";
}

export function formatBytes(n) {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Couldn't read that file."));
    r.readAsDataURL(blob);
  });
}

// A File/Blob the student just picked, ready to hand to the runner.
export async function assetFromBlob(name, blob, extra = {}) {
  const kind = kindOfName(name);
  // `blob` is kept for every kind - the runner only needs the decoded form, but
  // "Download for Processing" has to write the original bytes back out
  // (including a .vlw font the runner itself can't use).
  const asset = { name, size: blob.size, kind, blob, ...extra };
  if (kind === "image") asset.dataUrl = await readAsDataUrl(blob);
  else if (kind === "text") asset.text = await blob.text();
  return asset;
}

// A row from the sketch-assets list action ({ id, name, size_bytes, url }):
// downloads the bytes from the signed URL.
export async function assetFromRow(row) {
  if (!row.url) throw new Error(`Couldn't get a download link for ${row.name}.`);
  const resp = await fetch(row.url);
  if (!resp.ok) throw new Error(`Couldn't download ${row.name}.`);
  return assetFromBlob(row.name, await resp.blob(), { id: row.id, size: row.size_bytes });
}

// What the runner iframe wants: { [name]: { kind, dataUrl?, text? } }.
export function assetsToRunnerFiles(assets) {
  const files = {};
  for (const a of assets || []) files[a.name] = { kind: a.kind, dataUrl: a.dataUrl, text: a.text };
  return files;
}

// Downloads in small batches so a sketch with 40 images doesn't open 40
// simultaneous connections.
export async function loadAssets(rows, concurrency = 6) {
  const out = new Array(rows.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
      while (next < rows.length) {
        const i = next++;
        out[i] = await assetFromRow(rows[i]);
      }
    })
  );
  return out;
}
