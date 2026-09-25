// Groups a class's notes into folders by unit - the same units the
// Assignments tab uses, in the same teacher-set order (units.position).
// Unfiled notes (unit_id null, which includes every note written before
// notes could be filed) always come last. Within a folder notes sort by
// title, with numeric-aware comparison so "Lesson 2" lands before "Lesson 10".
//
// `includeEmpty` keeps units with no notes in them - the teacher side wants
// every unit visible as somewhere to file into; students only see folders
// that actually have something published in them.
export function groupNotesByUnit(notes, units, { includeEmpty = false, courses = [] } = {}) {
  const byTitle = (a, b) => (a.title || "").localeCompare(b.title || "", undefined, { numeric: true });
  const courseName = (id) => courses.find((c) => c.id === id)?.name || "";
  const unitIds = new Set((units || []).map((u) => u.id));

  const folders = [...(units || [])]
    .sort(
      (a, b) =>
        courseName(a.course_id).localeCompare(courseName(b.course_id)) ||
        (a.position ?? 9999) - (b.position ?? 9999) ||
        (a.name || "").localeCompare(b.name || "")
    )
    .map((u) => ({
      key: u.id,
      unit: u,
      label: u.name,
      course: courseName(u.course_id),
      notes: (notes || []).filter((n) => n.unit_id === u.id).sort(byTitle),
    }))
    .filter((f) => includeEmpty || f.notes.length > 0);

  // A unit_id pointing at a unit not in `units` (shouldn't happen - deleting
  // a unit nulls it) still gets shown, as unfiled, rather than vanishing.
  const unfiled = (notes || []).filter((n) => !n.unit_id || !unitIds.has(n.unit_id)).sort(byTitle);
  if (unfiled.length > 0) {
    folders.push({ key: "unfiled", unit: null, label: "Other Notes", course: "", notes: unfiled });
  }
  return folders;
}
