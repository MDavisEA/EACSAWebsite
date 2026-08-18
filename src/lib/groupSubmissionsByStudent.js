// Multiple submission rows can exist for the same student on the same piece
// of work. Going forward this should be rare (startFresh/startCoding now hand
// back an existing row instead of inserting a second one), but real data from
// before that fix - and any future edge case - can still hold genuine
// duplicates. Every place that lists, counts, or aggregates submissions needs
// to treat those as one student, not several, or a class of three resubmits
// looks like three separate students, class-wide stats get whoever
// resubmitted counted multiple times, and CSV exports gain phantom rows.
//
// Keyed the same way everywhere: the signed-in user where there is one,
// falling back to email then name for rows predating sign-in.
export function studentKey(s) {
  return s.student_user_id || (s.student_email || "").toLowerCase() || s.student_name || s.id;
}

/** One submission per student - their most recent by submitted_at. */
export function latestPerStudent(submissions) {
  const byStudent = new Map();
  for (const s of submissions) {
    const key = studentKey(s);
    const prev = byStudent.get(key);
    if (!prev || new Date(s.submitted_at ?? 0) > new Date(prev.submitted_at ?? 0)) {
      byStudent.set(key, s);
    }
  }
  return [...byStudent.values()];
}

/**
 * Groups ALL of a student's submissions together, newest first within each
 * group, for a UI that wants to offer older attempts rather than only the
 * latest (see CodeReviewGrader's attempt switcher).
 */
export function groupByStudent(submissions) {
  const byStudent = new Map();
  for (const s of submissions) {
    const key = studentKey(s);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push(s);
  }
  return [...byStudent.values()].map((all) => {
    const sorted = [...all].sort(
      (a, b) => new Date(b.submitted_at ?? 0) - new Date(a.submitted_at ?? 0)
    );
    return { key: studentKey(sorted[0]), name: sorted[0].student_name, latest: sorted[0], all: sorted };
  });
}
