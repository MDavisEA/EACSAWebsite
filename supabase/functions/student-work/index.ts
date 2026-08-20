import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/teacherAuth.ts';
import { getStudentFromRequest } from '../_shared/studentAuth.ts';

// Powers the signed-in student dashboard: everything assigned to this student,
// across all three kinds of work, each with where they stand on it.
//
// Deliberately returns a NARROW shape - id, title, due date, status, score.
// Nothing here carries answer keys, test-case details, expected output, or a
// teacher's review prompt, so there is no sanitizing to get wrong. The pages
// that need the full item still fetch it through the existing per-type
// endpoints, which do their own stripping.

// The five states a student's dashboard sorts work into. 'graded' means
// "scored, and they have not told us they read the feedback yet"; 'reviewed'
// is that same work after they mark it, which moves it out of the main list.
type Status = 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'reviewed';

interface WorkItem {
  kind: 'frq' | 'code' | 'project';
  id: string;
  title: string;
  due_date: string | null;
  status: Status;
  score: number | null;
  points_possible: number | null;
  submitted_at: string | null;
  is_late: boolean;
  // Needed so the dashboard can mark feedback reviewed without a second
  // round-trip to find which submission row this item belongs to.
  submission_id: string | null;
  // Where it sits in the course, for grouping. unit_id is null for work the
  // teacher never filed under a unit.
  course_id: string | null;
  unit_id: string | null;
  // The teacher's own ordering within a unit, used as the tie-break once
  // items are sorted by status - so equal-status work stays in the order the
  // teacher arranged it rather than jumping around.
  sort_order: number | null;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = createAdminClient();
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    const student = await getStudentFromRequest(req, admin);
    if (!student) {
      return json({ error: 'Please sign in with your school Google account to continue.' }, 401);
    }

    if (action !== 'myAssignedWork') {
      return json({ error: `Unknown action: ${action}` }, 400);
    }

    // Which course rosters this student is on. Matched on email because that
    // is what Google sign-in gives us and what the roster CSV carries; name
    // matching is too unreliable to gate visibility on.
    const { data: rosterRows, error: rosterErr } = await admin
      .from('roster_students')
      .select('course_id, email');
    if (rosterErr) return json({ error: rosterErr.message }, 500);

    const myEmail = student.email.toLowerCase();
    const myCourseIds = (rosterRows || [])
      .filter((r: Record<string, any>) => (r.email || '').toLowerCase() === myEmail)
      .map((r: Record<string, any>) => r.course_id);

    // An item with no course is for everyone; an item with a course is only
    // for students on that roster.
    const visibleToMe = (courseId: string | null) => courseId === null || myCourseIds.includes(courseId);

    const [assignments, problems, projects, subs, units, courses] = await Promise.all([
      admin.from('assignments').select('id, title, due_date, course_id, unit_id, sort_order, questions').eq('is_active', true),
      admin.from('coding_problems').select('id, title, due_date, course_id, unit_id, sort_order, points_possible').eq('is_active', true),
      admin.from('projects').select('id, title, due_date, course_id, unit_id, sort_order').eq('is_active', true),
      admin.from('submissions').select('*').eq('student_user_id', student.id),
      // Only this student's own courses' units/names are ever returned, since
      // everything below is filtered by visibleToMe.
      myCourseIds.length > 0
        ? admin.from('units').select('id, course_id, name, position').in('course_id', myCourseIds)
        : Promise.resolve({ data: [], error: null }),
      myCourseIds.length > 0
        ? admin.from('courses').select('id, name').in('id', myCourseIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    for (const r of [assignments, problems, projects, subs, units, courses]) {
      if (r.error) return json({ error: r.error.message }, 500);
    }

    const mySubs = subs.data || [];

    // A student can legitimately end up with more than one row for the same
    // item: startFresh inserts unconditionally, and findMyOpenSubmission only
    // looks for UNSUBMITTED rows - so re-opening an assignment they already
    // finished creates a second, empty one alongside the graded one. Picking
    // arbitrarily would show "In progress" and hide a grade they already have,
    // so prefer the row that represents real work: a submitted one over an
    // in-progress one, and the most recently submitted among those.
    const findSub = (field: string, id: string) => {
      const matches = mySubs.filter((s: Record<string, any>) => s[field] === id);
      if (matches.length <= 1) return matches[0];
      const submitted = matches.filter((s: Record<string, any>) => s.submitted);
      if (submitted.length === 0) return matches[0];
      return submitted.sort(
        (a: Record<string, any>, b: Record<string, any>) =>
          new Date(b.submitted_at ?? 0).getTime() - new Date(a.submitted_at ?? 0).getTime()
      )[0];
    };

    // Project feedback is release-gated (see submissions/index.ts); FRQ and
    // code scores are not, and must not become gated retroactively or every
    // score already entered would vanish from the student's view.
    function statusFor(sub: Record<string, any> | undefined, score: number | null, gated: boolean): {
      status: Status;
      score: number | null;
    } {
      if (!sub) return { status: 'not_started', score: null };
      if (!sub.submitted) return { status: 'in_progress', score: null };
      const visibleScore = gated && !sub.feedback_released ? null : score;
      if (visibleScore !== null && visibleScore !== undefined) {
        // Only work whose feedback they can actually see can be marked read,
        // so 'reviewed' is checked inside the scored branch rather than up
        // front - a project still awaiting release stays 'submitted' even if
        // the flag somehow got set.
        return { status: sub.feedback_reviewed_at ? 'reviewed' : 'graded', score: visibleScore };
      }
      return { status: 'submitted', score: null };
    }

    const items: WorkItem[] = [];

    for (const a of assignments.data || []) {
      if (!visibleToMe(a.course_id)) continue;
      const sub = findSub('assignment_id', a.id);
      const { status, score } = statusFor(sub, sub?.score ?? null, false);
      // `?? 9` matches what SubmissionDetail and SubmissionViewer already
      // assume for a question with no explicit max_score - defaulting to 0
      // here instead would show a different total than the detail view.
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
      });
    }

    for (const p of problems.data || []) {
      if (!visibleToMe(p.course_id)) continue;
      const sub = findSub('coding_problem_id', p.id);
      // autograde_score for an autograded Mini Problem, `score` for a
      // hand-graded Coding Assignment - the teacher marks those into `score`
      // (see CodeReviewGrader/GradingQueue), so reading only autograde_score
      // left every hand-graded submission stuck on "waiting on grade" forever,
      // and the new-feedback/Reviewed flow unreachable for that whole kind.
      // Matches what SubmissionDetail already does for the same row.
      const { status, score } = statusFor(sub, sub?.autograde_score ?? sub?.score ?? null, false);
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
      });
    }

    for (const pr of projects.data || []) {
      if (!visibleToMe(pr.course_id)) continue;
      const sub = findSub('project_id', pr.id);
      const { status, score } = statusFor(sub, sub?.score ?? null, true);
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
      });
    }

    return json({
      results: items,
      student_name: student.name,
      units: units.data || [],
      // Only used to label unit headings when a student is on more than one
      // course's roster - otherwise the course name is redundant.
      courses: courses.data || [],
    });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
