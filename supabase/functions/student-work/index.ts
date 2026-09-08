import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/teacherAuth.ts';
import { getStudentFromRequest } from '../_shared/studentAuth.ts';
import { buildWorkItems } from '../_shared/workItems.ts';
import { fetchOverridesByWorkId, resolveDueDates } from '../_shared/sectionDueDates.ts';

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
      .select('course_id, email, section_id');
    if (rosterErr) return json({ error: rosterErr.message }, 500);

    const myEmail = student.email.toLowerCase();
    const myRosterRows = (rosterRows || []).filter(
      (r: Record<string, any>) => (r.email || '').toLowerCase() === myEmail
    );
    const myCourseIds = myRosterRows.map((r: Record<string, any>) => r.course_id);
    // This student's own section per course - a course they are on twice
    // (should not happen, but roster data is hand-edited) keeps whichever
    // row matched last, same as any other roster lookup here.
    const sectionByCourse = new Map<string, string | null>(
      myRosterRows.map((r: Record<string, any>) => [r.course_id, r.section_id || null])
    );
    const sectionForRow = (row: Record<string, any>) => sectionByCourse.get(row.course_id ?? '') ?? null;

    // An item with no course is for everyone; an item with a course is only
    // for students on that roster.
    const visibleToMe = (courseId: string | null) => courseId === null || myCourseIds.includes(courseId);

    const [assignments, problems, projects, subs, units, courses, notes] = await Promise.all([
      admin.from('assignments').select('id, title, due_date, course_id, unit_id, sort_order, questions').eq('is_active', true),
      admin.from('coding_problems').select('id, title, due_date, course_id, unit_id, sort_order, points_possible').eq('is_active', true),
      admin.from('projects').select('id, title, due_date, course_id, unit_id, sort_order').eq('is_active', true),
      // Same reason as courses/index.ts: this builds statuses, not detail
      // views, so the heavy columns stay on the server.
      admin.from('submissions').select('id, assignment_id, coding_problem_id, project_id, student_name, student_email, student_user_id, submitted, submitted_at, score, autograde_score, feedback_released, feedback_reviewed_at').eq('student_user_id', student.id),
      // Only this student's own courses' units/names are ever returned, since
      // everything below is filtered by visibleToMe.
      myCourseIds.length > 0
        ? admin.from('units').select('id, course_id, name, position').in('course_id', myCourseIds)
        : Promise.resolve({ data: [], error: null }),
      myCourseIds.length > 0
        ? admin.from('courses').select('id, name').in('id', myCourseIds)
        : Promise.resolve({ data: [], error: null }),
      // A note reaches a student only once the teacher has published it AND
      // only for a course they are actually on - never previewed here, unlike
      // the teacher's own list which sees every note regardless of status.
      myCourseIds.length > 0
        ? admin.from('notes').select('id, course_id, title, content_html, updated_at').eq('is_published', true).in('course_id', myCourseIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    for (const r of [assignments, problems, projects, subs, units, courses, notes]) {
      if (r.error) return json({ error: r.error.message }, 500);
    }

    const visibleAssignments = (assignments.data || []).filter((a: Record<string, any>) => visibleToMe(a.course_id ?? null));
    const visibleProblems = (problems.data || []).filter((p: Record<string, any>) => visibleToMe(p.course_id ?? null));
    const visibleProjects = (projects.data || []).filter((pr: Record<string, any>) => visibleToMe(pr.course_id ?? null));

    const [assignmentOverrides, problemOverrides, projectOverrides] = await Promise.all([
      fetchOverridesByWorkId(admin, 'assignment_id', visibleAssignments.map((a: Record<string, any>) => a.id)),
      fetchOverridesByWorkId(admin, 'coding_problem_id', visibleProblems.map((p: Record<string, any>) => p.id)),
      fetchOverridesByWorkId(admin, 'project_id', visibleProjects.map((p: Record<string, any>) => p.id)),
    ]);

    const items = buildWorkItems(
      resolveDueDates(visibleAssignments, assignmentOverrides, sectionForRow),
      resolveDueDates(visibleProblems, problemOverrides, sectionForRow),
      resolveDueDates(visibleProjects, projectOverrides, sectionForRow),
      subs.data || []
    );

    return json({
      results: items,
      student_name: student.name,
      units: units.data || [],
      // Only used to label unit headings when a student is on more than one
      // course's roster - otherwise the course name is redundant.
      courses: courses.data || [],
      notes: notes.data || [],
    });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
