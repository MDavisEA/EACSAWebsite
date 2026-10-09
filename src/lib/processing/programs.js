// A sketch assignment can ask for several programs (a problem set of mini
// programs rather than one big one). The teacher's list lives on the project as
// `parts: [{ id, title, description, points }]`; empty means a single program.
//
// A student's tabs for program "p_x7k2" are stored in `submissions.files` as
// { part: "p_x7k2", filename: "p_x7k2/Sketch.pde", content } - a path, so two
// programs can each have a tab called Sketch without colliding in the one list
// that grading, line comments and exports all key by filename. These helpers
// are the only place that knows that convention.

/** The program a stored file belongs to, or null for a single-program sketch. */
export function partIdOf(file) {
  if (file.part) return file.part;
  const i = (file.filename || "").indexOf("/");
  return i > 0 ? file.filename.slice(0, i) : null;
}

/** "p_x7k2/Sketch.pde" -> "Sketch.pde" */
export function baseName(filename) {
  const i = (filename || "").indexOf("/");
  return i >= 0 ? filename.slice(i + 1) : filename;
}

/**
 * Stored files grouped by program, in the teacher's order:
 *   [{ key, part: {id,title,points}|null, title, files }]
 * A program nobody wrote anything for is simply absent. Files whose program the
 * teacher has since deleted get their own "Removed program" group rather than
 * disappearing - the student did turn them in.
 */
export function groupFilesByPart(files, parts = []) {
  const list = files || [];
  const known = new Map(parts.map((p) => [p.id, p]));
  const buckets = new Map();
  for (const f of list) {
    const id = partIdOf(f);
    const key = id ?? "__none__";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(f);
  }
  const groups = [];
  for (const p of parts) {
    if (buckets.has(p.id)) groups.push({ key: p.id, part: p, title: p.title, files: buckets.get(p.id) });
  }
  for (const [key, fs] of buckets) {
    if (key === "__none__") groups.unshift({ key, part: null, title: parts.length ? "Code" : "", files: fs });
    else if (!known.has(key)) groups.push({ key, part: null, title: "Removed program", files: fs });
  }
  return groups;
}

/** Total points when EVERY program says what it is worth - a partial total would read as too low. */
export function partsTotalPoints(parts) {
  if (!parts?.length || !parts.every((p) => typeof p.points === "number")) return null;
  return parts.reduce((sum, p) => sum + p.points, 0);
}

/** Sum of per-program scores typed as strings; null when none has been entered. */
export function sumPartScores(scores) {
  const nums = Object.values(scores || {})
    .map((v) => parseFloat(v))
    .filter((n) => !Number.isNaN(n));
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}
