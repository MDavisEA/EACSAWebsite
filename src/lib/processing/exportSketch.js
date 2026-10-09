import JSZip from "jszip";
import { baseName } from "@/lib/processing/programs";

// "Download for Processing": one student's sketch as folders real Processing
// opens directly. Processing needs a folder and its main .pde to share a name
// (and be a valid identifier), so both are named after the student and the
// assignment (or program) rather than whatever the student called a tab.

export function safeIdentifier(raw, fallback = "Sketch") {
  let s = String(raw || "").trim().replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!s) s = fallback;
  if (!/^[A-Za-z_]/.test(s)) s = `_${s}`;
  return s.slice(0, 60);
}

function addSketchFolder(parent, folder, files, assets) {
  const root = parent.folder(folder);
  (files || []).forEach((f, i) => {
    // The first tab is the main sketch; Processing wants it named after the folder.
    const name = i === 0 ? folder : baseName(f.filename).replace(/\.pde$/i, "");
    root.file(`${name}.pde`, f.content);
  });
  const data = root.folder("data");
  (assets || []).forEach((a) => { if (a.blob) data.file(a.name, a.blob); });
}

/**
 * `programs` is [{ title, files }]. One program with no title is a plain
 * single-program sketch: the zip IS that folder. Several programs (a problem
 * set) become one zip holding a sketch folder per program; the student's
 * uploaded files are copied into each, since Processing looks for them in the
 * sketch's own data/ folder.
 */
export async function downloadSketchZip({ studentName, projectTitle, programs, assets }) {
  const base = safeIdentifier(`${studentName || "student"}_${projectTitle || "sketch"}`);
  const zip = new JSZip();
  const list = (programs || []).filter((p) => (p.files || []).length > 0);
  if (list.length === 1 && !list[0].title) {
    addSketchFolder(zip, base, list[0].files, assets);
  } else {
    const used = new Set();
    list.forEach((p, i) => {
      let name = safeIdentifier(`${studentName || "student"}_${p.title || `Program_${i + 1}`}`);
      while (used.has(name.toLowerCase())) name = `${name}_${i + 1}`;
      used.add(name.toLowerCase());
      addSketchFolder(zip, name, p.files, assets);
    });
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${base}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return base;
}
