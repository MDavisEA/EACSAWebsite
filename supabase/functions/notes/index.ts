import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest, teacherCourseIds, teacherOwnsCourse, teacherOwnsRow } from '../_shared/teacherAuth.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = createAdminClient();
    const body = await req.json();
    const { action } = body;

    // ---- Teacher-only - a note is only ever read by students through
    // student-work's myAssignedWork, which selects just the published,
    // roster-visible columns itself. Nothing here is reachable without a
    // teacher session. ----

    const teacher = await getTeacherFromRequest(req, admin);
    if (!teacher) return json({ error: 'Unauthorized' }, 401);

    if (action === 'list') {
      const mine = await teacherCourseIds(admin, teacher.id);
      if (mine.length === 0) return json({ results: [] });
      const { data, error } = await admin
        .from('notes')
        .select('*')
        .in('course_id', mine)
        .order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ results: data || [] });
    }

    if (action === 'create') {
      if (!(await teacherOwnsCourse(admin, teacher.id, body.data?.course_id))) {
        return json({ error: 'Pick one of your own courses for this note.' }, 403);
      }
      const { course_id, title, content_html } = body.data || {};
      if (!title?.trim()) return json({ error: 'A title is required.' }, 400);
      const { data, error } = await admin
        .from('notes')
        .insert({ course_id, title: title.trim(), content_html: content_html || '' })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'update') {
      if (!(await teacherOwnsRow(admin, teacher.id, 'notes', body.id))) {
        return json({ error: 'Not found' }, 404);
      }
      const { title, content_html, is_published } = body.data || {};
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (title !== undefined) {
        if (!title.trim()) return json({ error: 'A title is required.' }, 400);
        update.title = title.trim();
      }
      if (content_html !== undefined) update.content_html = content_html;
      if (is_published !== undefined) update.is_published = is_published;
      const { data, error } = await admin.from('notes').update(update).eq('id', body.id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'delete') {
      if (!(await teacherOwnsRow(admin, teacher.id, 'notes', body.id))) {
        return json({ error: 'Not found' }, 404);
      }
      const { error } = await admin.from('notes').delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
