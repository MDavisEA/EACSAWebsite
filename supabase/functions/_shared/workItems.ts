// Shared between student-work/index.ts (a signed-in student's own dashboard)
// and courses/index.ts (a teacher looking at one student, or a whole roster,
// from the course side) - both need "given this identity's submissions and
// the active work in scope, what is the status of each item," and it should
// only ever be implemented once.

// The five states a dashboard sorts work into. 'graded' means "scored, and
// they have not told us they read the feedback yet"; 'reviewed' is that same
// work after they mark it, which moves it out of the main list. 'complete'
// is loop practice only - there's no teacher grading step to wait for or
// feedback to read, just "reached the target score or not."
export type Status = 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'reviewed' | 'complete';

export interface WorkItem {
  kind: 'frq' | 'code' | 'project' | 'loop';
  id: string;
  title: string;
  due_date: string | null;
  status: Status;
  score: number | null;
  points_possible: number | null;
  submitted_at: string | null;
  is_late: boolean;
  // So a caller can act on the submission (mark reviewed, open it for
  // grading) without a second round trip to find which row this item is.
  submission_id: string | null;
  course_id: string | null;
  unit_id: string | null;
  sort_order: number | null;
  // Whether there is an overall comment / any line comments to read - not
  // the text itself, just enough for a student to tell before clicking in
  // whether it is worth digging into the feedback or just a bare score.
  // Line comments specifically mean "commented on a specific line of code,"
  // never true for an FRQ (which has no lines of code - its own per-part
  // remarks live in a different column this never looks at).
  has_comment: boolean;
  has_line_comments: boolean;
  // The teacher checked "require the student to confirm they read this" and
  // they have not yet done so. Only ever true alongside status 'graded' -
  // the moment they acknowledge it (the same feedback_reviewed_at flow the
  // optional "mark reviewed" button already used), status becomes
  // 'reviewed' and this goes false, same as if they had just clicked it
  // unprompted.
  needs_ack: boolean;
}

// Project feedback is release-gated (see submissions/index.ts); FRQ and code
// scores are not, and must not become gated retroactively or every score
// already entered would vanish from view.
export function statusForSubmission(
  sub: Record<string, any> | undefined,
  score: number | null,
  gated: boolean
): { status: Status; score: number | null } {
  if (!sub) return { status: 'not_started', score: null };
  if (!sub.submitted) return { status: 'in_progress', score: null };
  const visibleScore = gated && !sub.feedback_released ? null : score;
  if (visibleScore !== null && visibleScore !== undefined) {
    // Only work whose feedback is actually visible can be marked read, so
    // 'reviewed' is checked inside the scored branch rather than up front -
    // a project still awaiting release stays 'submitted' even if the flag
    // somehow got set.
    return { status: sub.feedback_reviewed_at ? 'reviewed' : 'graded', score: visibleScore };
  }
  return { status: 'submitted', score: null };
}

// Same gating as the score itself (see visibleScore above): a project's
// feedback - including the mere fact that some exists - stays invisible
// until the teacher releases it, so this never becomes a way to learn
// "there is something waiting for you" ahead of that release.
function feedbackFlags(
  sub: Record<string, any> | undefined,
  gated: boolean
): { has_comment: boolean; has_line_comments: boolean } {
  if (!sub || (gated && !sub.feedback_released)) return { has_comment: false, has_line_comments: false };
  return {
    has_comment: !!(sub.teacher_comments || '').trim(),
    has_line_comments: (sub.line_comments || []).length > 0,
  };
}

// Builds one identity's WorkItem[] from the active work in scope and THEIR
// OWN submissions (already filtered to one student before calling this -
// picking the right identity's rows is the caller's job, since "how do I
// find this identity's submissions" differs: the signed-in student's own JWT
// vs. matching a roster row by email).
export function buildWorkItems(
  assignments: Record<string, any>[],
  problems: Record<string, any>[],
  projects: Record<string, any>[],
  subs: Record<string, any>[],
  loopAssignments: Record<string, any>[] = []
): WorkItem[] {
  // A student can legitimately end up with more than one row for the same
  // item (reopening something already finished creates a second, empty one
  // alongside the graded one) - prefer the row that represents real work: a
  // submitted one over an in-progress one, and the most recent among those.
  const findSub = (field: string, id: string) => {
    const matches = subs.filter((s) => s[field] === id);
    if (matches.length <= 1) return matches[0];
    const submitted = matches.filter((s) => s.submitted);
    if (submitted.length === 0) return matches[0];
    return submitted.sort(
      (a, b) => new Date(b.submitted_at ?? 0).getTime() - new Date(a.submitted_at ?? 0).getTime()
    )[0];
  };

  const items: WorkItem[] = [];

  for (const a of assignments) {
    const sub = findSub('assignment_id', a.id);
    const { status, score } = statusForSubmission(sub, sub?.score ?? null, false);
    // `?? 9` matches what SubmissionDetail/SubmissionViewer already assume
    // for a question with no explicit max_score.
    const maxScore = (a.questions || []).reduce(
      (sum: number, q: Record<string, any>) => sum + (Number(q.max_score ?? 9) || 0),
      0
    );
    items.push({
      kind: 'frq',
      id: a.id,
      title: a.title,
      due_date: a.due_date ?? null,
      status,
      score,
      points_possible: maxScore || null,
      submitted_at: sub?.submitted_at ?? null,
      is_late: !!(a.due_date && sub?.submitted_at && new Date(sub.submitted_at) > new Date(a.due_date)),
      submission_id: sub?.id ?? null,
      course_id: a.course_id ?? null,
      unit_id: a.unit_id ?? null,
      sort_order: a.sort_order ?? null,
      ...feedbackFlags(sub, false),
      needs_ack: status === 'graded' && !!sub?.feedback_ack_required,
    });
  }

  for (const p of problems) {
    const sub = findSub('coding_problem_id', p.id);
    // autograde_score for an autograded Mini Problem, `score` for a
    // hand-graded Coding Assignment - the teacher marks those into `score`.
    const { status, score } = statusForSubmission(sub, sub?.autograde_score ?? sub?.score ?? null, false);
    items.push({
      kind: 'code',
      id: p.id,
      title: p.title,
      due_date: p.due_date ?? null,
      status,
      score,
      points_possible: p.points_possible ?? null,
      submitted_at: sub?.submitted_at ?? null,
      is_late: !!(p.due_date && sub?.submitted_at && new Date(sub.submitted_at) > new Date(p.due_date)),
      submission_id: sub?.id ?? null,
      course_id: p.course_id ?? null,
      unit_id: p.unit_id ?? null,
      sort_order: p.sort_order ?? null,
      ...feedbackFlags(sub, false),
      needs_ack: status === 'graded' && !!sub?.feedback_ack_required,
    });
  }

  for (const pr of projects) {
    const sub = findSub('project_id', pr.id);
    const { status, score } = statusForSubmission(sub, sub?.score ?? null, true);
    items.push({
      kind: 'project',
      id: pr.id,
      title: pr.title,
      due_date: pr.due_date ?? null,
      status,
      score,
      points_possible: null,
      submitted_at: sub?.submitted_at ?? null,
      is_late: !!(pr.due_date && sub?.submitted_at && new Date(sub.submitted_at) > new Date(pr.due_date)),
      submission_id: sub?.id ?? null,
      course_id: pr.course_id ?? null,
      unit_id: pr.unit_id ?? null,
      sort_order: pr.sort_order ?? null,
      ...feedbackFlags(sub, true),
      needs_ack: status === 'graded' && !!sub?.feedback_ack_required,
    });
  }

  // No teacher grading step: 'complete' just means the running score reached
  // the assignment's target (see submitLoopAnswer in submissions/index.ts,
  // which is what actually flips submitted to true). points_possible here is
  // the target_score, not a max earned some other way.
  for (const la of loopAssignments) {
    const sub = findSub('loop_assignment_id', la.id);
    const status: Status = !sub ? 'not_started' : !sub.submitted ? 'in_progress' : 'complete';
    items.push({
      kind: 'loop',
      id: la.id,
      title: la.title,
      due_date: la.due_date ?? null,
      status,
      score: status === 'complete' ? sub?.loop_score ?? null : null,
      points_possible: la.target_score ?? null,
      submitted_at: sub?.submitted_at ?? null,
      is_late: false,
      submission_id: sub?.id ?? null,
      course_id: la.course_id ?? null,
      unit_id: la.unit_id ?? null,
      sort_order: la.sort_order ?? null,
      has_comment: false,
      has_line_comments: false,
      needs_ack: false,
    });
  }

  return items;
}
