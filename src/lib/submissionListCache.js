// Remembers the submissions list last shown for a piece of work.
//
// Collapsing "View Submissions" unmounts the viewer, so its state - including
// the list it just downloaded - is gone, and re-opening the same card paid the
// full round trip again. This lives in module scope precisely because the
// component does not survive the collapse.
//
// Read as show-this-now, not as the truth: a viewer paints from the cache so
// the list is there immediately, then refetches in the background and replaces
// it. That way a stale list can never outlive the moment it is displayed, and
// nothing here needs invalidating when a grade is saved elsewhere. It is also
// dropped entirely on a page load, so it can never go stale across sessions.
const cache = new Map();

const keyFor = ({ assignment_id, coding_problem_id, project_id }) =>
  `a:${assignment_id || ""}|c:${coding_problem_id || ""}|p:${project_id || ""}`;

export function getCachedList(criteria) {
  return cache.get(keyFor(criteria));
}

export function setCachedList(criteria, rows) {
  cache.set(keyFor(criteria), rows);
}
