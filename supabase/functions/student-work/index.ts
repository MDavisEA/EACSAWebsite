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

type Status = 'not_started' | 'in_progress' | 'submitted' | 'graded';

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

    const [assignments, problems, projects, subs] = await Promise.all([
      admin.from('assignments').select('id, title, due_date, course_id, questions').eq('is_active', true),
      admin.from('coding_problems').select('id, title, due_date, course_id, points_possible').eq('is_active', true),
      admin.from('projects').select('id, title, due_date, course_id').eq('is_active', true),
      admin.from('submissions').select('*').eq('student_user_id', student.id),
    ]);

    for (const r of [assignments, problems, projects, subs]) {
      if (r.error) return json({ error: r.error.message }, 500);
    }

    const mySubs = subs.data || [];
    const findSub = (field: string, id: string) =>
      mySubs.find((s: Record<string, any>) => s[field] === id);

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
      if (visibleScore !== null && visibleScore !== undefined) return { status: 'graded', score: visibleScore };
      return { status: 'submitted', score: null };
    }

    const items: WorkItem[] = [];

    for (const a of assignments.data || []) {
      if (!visibleToMe(a.course_id)) continue;
      const sub = findSub('assignment_id', a.id);
      const { status, score } = statusFor(sub, sub?.score ?? null, false);
      const maxScore = (a.questions || []).reduce(
        (sum: number, q: Record<string, any>) => sum + (Number(q.max_score) || 0),
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
      });
    }

    for (const p of problems.data || []) {
      if (!visibleToMe(p.course_id)) continue;
      const sub = findSub('coding_problem_id', p.id);
      const { status, score } = statusFor(sub, sub?.autograde_score ?? null, false);
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
      });
    }

    return json({ results: items, student_name: student.name });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
