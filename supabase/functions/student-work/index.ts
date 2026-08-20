import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/teacherAuth.ts';
import { getStudentFromRequest } from '../_shared/studentAuth.ts';
import { buildWorkItems } from '../_shared/workItems.ts';

// Powers the signed-in student dashboard: everything assigned to this student,
// across all three kinds of work, each with where they stand on it.
//
// Deliberately returns a NARROW shape - id, title, due date, status, score.
// Nothing here carries answer keys, test-case details, expected output, or a
// teacher's review prompt, so there is no sanitizing to get wrong. The pages
// that need the full item still fetch it through the existing per-type
// endpoints, which do their own stripping.
//
// The per-item status logic itself lives in _shared/workItems.ts, shared with
// courses/index.ts's rosterWithStatus - a teacher looking at one student or a
// whole roster needs the exact same status rules, just applied to a
// different identity than "whoever is signed in right now."

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

    const items = buildWorkItems(
      (assignments.data || []).filter((a: Record<string, any>) => visibleToMe(a.course_id ?? null)),
      (problems.data || []).filter((p: Record<string, any>) => visibleToMe(p.course_id ?? null)),
      (projects.data || []).filter((pr: Record<string, any>) => visibleToMe(pr.course_id ?? null)),
      subs.data || []
    );

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
