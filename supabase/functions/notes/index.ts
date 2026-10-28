import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest, teacherCourseIds, teacherOwnsCourse, teacherOwnsRow } from '../_shared/teacherAuth.ts';
import { propagateToLinkedCourses } from '../_shared/courseLinks.ts';

// A note's unit has to belong to that note's own course - otherwise a stray
// unit id could file a note under a folder in some other teacher's class.
// null/empty always passes (unfiled).
async function unitInCourse(admin: any, unitId: string | null | undefined, courseId: string): Promise<boolean> {
  if (!unitId) return true;
  const { data } = await admin.from('units').select('course_id').eq('id', unitId).maybeSingle();
  return data?.course_id === courseId;
}

// A pasted Loom link, reduced to its video id and rebuilt as a canonical
// share link - the id is the only part of the input that survives, so the
// iframe students see can only ever be a Loom player. Same rules as
// src/lib/loom.js. Returns undefined for "not a Loom video link".
function loomShareUrl(url: string): string | undefined {
  const m = /^https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/([^/?#\s]+)/i.exec(url.trim());
  if (!m) return undefined;
  const hex = /([0-9a-f]{32})$/i.exec(m[1]);
  const id = hex ? hex[1].toLowerCase() : /^[A-Za-z0-9]{10,64}$/.test(m[1]) ? m[1] : null;
  return id ? `https://www.loom.com/share/${id}` : undefined;
}

// null/empty clears the video; anything else must be a Loom link.
function normalizeVideoUrl(raw: unknown): { value: string | null } | { error: string } {
  if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) return { value: null };
  const url = typeof raw === 'string' ? loomShareUrl(raw) : undefined;
  return url ? { value: url } : { error: 'That does not look like a Loom video link (loom.com/share/...).' };
}

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
      const { course_id, unit_id, title, content_html, is_published, video_url } = body.data || {};
      if (!title?.trim()) return json({ error: 'A title is required.' }, 400);
      const video = normalizeVideoUrl(video_url);
      if ('error' in video) return json({ error: video.error }, 400);
      if (!(await unitInCourse(admin, unit_id, course_id))) {
        return json({ error: 'That unit is not in this course.' }, 400);
      }
      const { data, error } = await admin
        .from('notes')
        .insert({
          course_id,
          unit_id: unit_id || null,
          title: title.trim(),
          content_html: content_html || '',
          video_url: video.value,
          is_published: !!is_published,
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      await propagateToLinkedCourses(admin, 'notes', data);
      return json({ result: data });
    }

    if (action === 'update') {
      if (!(await teacherOwnsRow(admin, teacher.id, 'notes', body.id))) {
        return json({ error: 'Not found' }, 404);
      }
      const { title, content_html, is_published, unit_id, video_url } = body.data || {};
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (unit_id !== undefined) {
        const { data: existing } = await admin.from('notes').select('course_id').eq('id', body.id).single();
        if (!(await unitInCourse(admin, unit_id, existing.course_id))) {
          return json({ error: 'That unit is not in this course.' }, 400);
        }
        update.unit_id = unit_id || null;
      }
      if (title !== undefined) {
        if (!title.trim()) return json({ error: 'A title is required.' }, 400);
        update.title = title.trim();
      }
      if (content_html !== undefined) update.content_html = content_html;
      if (video_url !== undefined) {
        const video = normalizeVideoUrl(video_url);
        if ('error' in video) return json({ error: video.error }, 400);
        update.video_url = video.value;
      }
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
