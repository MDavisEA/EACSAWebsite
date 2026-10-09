import JSZip from "jszip";

// "Download for Processing": one student's sketch as a folder real Processing
// opens directly. Processing needs the folder and the main .pde to share a
// name (and be a valid identifier), so both are named after the student and
// the assignment rather than whatever the student called their first tab.

export function safeIdentifier(raw, fallback = "Sketch") {
  let s = String(raw || "").trim().replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!s) s = fallback;
  if (!/^[A-Za-z_]/.test(s)) s = `_${s}`;
  return s.slice(0, 60);
}

export async function downloadSketchZip({ studentName, projectTitle, files, assets }) {
  const folder = safeIdentifier(`${studentName || "student"}_${projectTitle || "sketch"}`);
  const zip = new JSZip();
  const root = zip.folder(folder);
  (files || []).forEach((f, i) => {
    // The first tab is the main sketch; Processing wants it named after the folder.
    const name = i === 0 ? folder : f.filename.replace(/\.pde$/i, "");
    root.file(`${name}.pde`, f.content);
  });
  const data = root.folder("data");
  (assets || []).forEach((a) => { if (a.blob) data.file(a.name, a.blob); });
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${folder}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return folder;
}
