import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest } from '../_shared/teacherAuth.ts';

// Courses and rosters exist purely so the teacher can see who has NOT turned
// work in. Nothing here is student-facing - every action is teacher-only.
Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = createAdminClient();
    const body = await req.json();
    const { action } = body;

    const teacher = await getTeacherFromRequest(req, admin);
    if (!teacher) return json({ error: 'Unauthorized' }, 401);

    if (action === 'list') {
      const { data, error } = await admin
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);

      // Roster counts come back with the list so the dashboard can show
      // "28 students" without a request per course.
      const { data: counts, error: countErr } = await admin.from('roster_students').select('course_id');
      if (countErr) return json({ error: countErr.message }, 500);
      const byCourse: Record<string, number> = {};
      (counts || []).forEach((r: Record<string, any>) => {
        byCourse[r.course_id] = (byCourse[r.course_id] || 0) + 1;
      });

      return json({
        results: (data || []).map((c: Record<string, any>) => ({ ...c, student_count: byCourse[c.id] || 0 })),
      });
    }

    if (action === 'create') {
      const { data, error } = await admin.from('courses').insert(body.data).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'update') {
      const { data, error } = await admin
        .from('courses')
        .update(body.data)
        .eq('id', body.id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'delete') {
      const { error } = await admin.from('courses').delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    if (action === 'listRoster') {
      const { data, error } = await admin
        .from('roster_students')
        .select('*')
        .eq('course_id', body.course_id)
        .order('student_name', { ascending: true });
      if (error) return json({ error: error.message }, 500);
      return json({ results: data || [] });
    }

    // Replaces the whole roster for a course rather than appending, so
    // re-uploading a corrected CSV is the obvious way to fix a typo instead
    // of leaving a duplicate behind.
    if (action === 'replaceRoster') {
      const { course_id, students } = body;
      if (!course_id || !Array.isArray(students)) {
        return json({ error: 'course_id and students are required' }, 400);
      }

      const rows = students
        .map((s: Record<string, any>) => ({
          course_id,
          student_name: (s.student_name || '').trim(),
          email: (s.email || '').trim() || null,
        }))
        .filter((s) => s.student_name);

      if (rows.length === 0) return json({ error: 'No usable rows found - every line needs at least a name.' }, 400);

      const { error: delErr } = await admin.from('roster_students').delete().eq('course_id', course_id);
      if (delErr) return json({ error: delErr.message }, 500);

      const { data, error } = await admin.from('roster_students').insert(rows).select();
      if (error) return json({ error: error.message }, 500);
      return json({ results: data || [] });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
