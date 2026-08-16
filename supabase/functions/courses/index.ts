import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest, teacherOwnsCourse } from '../_shared/teacherAuth.ts';

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

    // Every action below is scoped to courses this teacher owns. A course is
    // the unit of ownership for everything else on the site, so a hole here
    // would be a hole in all of it.
    const owns = (courseId: string | null | undefined) =>
      teacherOwnsCourse(admin, teacher.id, courseId);

    if (action === 'list') {
      const { data, error } = await admin
        .from('courses')
        .select('*')
        .eq('teacher_id', teacher.id)
        .order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);

      // Roster counts, units and sections come back with the list so the
      // dashboard can render a whole course without a request per course.
      const ids = (data || []).map((c: Record<string, any>) => c.id);
      const [counts, units, sections] = await Promise.all([
        ids.length ? admin.from('roster_students').select('course_id').in('course_id', ids) : { data: [] },
        ids.length ? admin.from('units').select('*').in('course_id', ids).order('position') : { data: [] },
        ids.length ? admin.from('sections').select('*').in('course_id', ids).order('position') : { data: [] },
      ]);
      const byCourse: Record<string, number> = {};
      (counts.data || []).forEach((r: Record<string, any>) => {
        byCourse[r.course_id] = (byCourse[r.course_id] || 0) + 1;
      });

      return json({
        results: (data || []).map((c: Record<string, any>) => ({
          ...c,
          student_count: byCourse[c.id] || 0,
          units: (units.data || []).filter((u: Record<string, any>) => u.course_id === c.id),
          sections: (sections.data || []).filter((s: Record<string, any>) => s.course_id === c.id),
        })),
      });
    }

    if (action === 'create') {
      // teacher_id comes from the verified session, never from the request -
      // otherwise a teacher could create a course owned by someone else.
      const { data, error } = await admin
        .from('courses')
        .insert({ ...body.data, teacher_id: teacher.id })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'update') {
      if (!(await owns(body.id))) return json({ error: 'Not found' }, 404);
      const { teacher_id: _ignored, ...safe } = body.data || {};
      const { data, error } = await admin
        .from('courses')
        .update(safe)
        .eq('id', body.id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'delete') {
      if (!(await owns(body.id))) return json({ error: 'Not found' }, 404);
      const { error } = await admin.from('courses').delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // ---- Units: how work is grouped inside a course ----

    if (action === 'createUnit' || action === 'createSection') {
      const table = action === 'createUnit' ? 'units' : 'sections';
      if (!(await owns(body.course_id))) return json({ error: 'Not found' }, 404);
      const { count } = await admin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('course_id', body.course_id);
      const { data, error } = await admin
        .from(table)
        .insert({ course_id: body.course_id, name: body.name, position: count ?? 0 })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'updateUnit' || action === 'updateSection') {
      const table = action === 'updateUnit' ? 'units' : 'sections';
      const { data: row } = await admin.from(table).select('course_id').eq('id', body.id).maybeSingle();
      if (!row || !(await owns(row.course_id))) return json({ error: 'Not found' }, 404);
      const { data, error } = await admin
        .from(table)
        .update({ name: body.name, ...(body.position !== undefined ? { position: body.position } : {}) })
        .eq('id', body.id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'deleteUnit' || action === 'deleteSection') {
      const table = action === 'deleteUnit' ? 'units' : 'sections';
      const { data: row } = await admin.from(table).select('course_id').eq('id', body.id).maybeSingle();
      if (!row || !(await owns(row.course_id))) return json({ error: 'Not found' }, 404);
      // Work in a deleted unit is not deleted with it - the foreign key nulls
      // the reference so it resurfaces as unfiled rather than disappearing
      // along with a unit the teacher was only reorganising.
      const { error } = await admin.from(table).delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    if (action === 'listRoster') {
      if (!(await owns(body.course_id))) return json({ error: 'Not found' }, 404);
      const { data, error } = await admin
        .from('roster_students')
        .select('*')
        .eq('course_id', body.course_id)
        .order('student_name', { ascending: true });
      if (error) return json({ error: error.message }, 500);

      // Flag whoever has never actually turned anything in under their roster
      // email. Usually that just means they have not started yet - but it is
      // also how a typo in the CSV shows itself, since a mistyped address can
      // never match the Google account the student signs in with.
      const { data: seen } = await admin
        .from('submissions')
        .select('student_email')
        .not('student_email', 'is', null);
      const seenEmails = new Set(
        (seen || []).map((s: Record<string, any>) => (s.student_email || '').toLowerCase())
      );

      return json({
        results: (data || []).map((r: Record<string, any>) => ({
          ...r,
          has_signed_in: seenEmails.has((r.email || '').toLowerCase()),
        })),
      });
    }

    // Replaces the whole roster for a course rather than appending, so
    // re-uploading a corrected CSV is the obvious way to fix a typo instead
    // of leaving a duplicate behind.
    if (action === 'replaceRoster') {
      const { course_id, students } = body;
      if (!course_id || !Array.isArray(students)) {
        return json({ error: 'course_id and students are required' }, 400);
      }
      if (!(await owns(course_id))) return json({ error: 'Not found' }, 404);

      const rows = students
        .map((s: Record<string, any>) => ({
          course_id,
          student_name: (s.student_name || '').trim(),
          email: (s.email || '').trim() || null,
          section_id: s.section_id || null,
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
