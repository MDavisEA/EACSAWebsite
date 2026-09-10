import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import {
  createAdminClient,
  getTeacherFromRequest,
  teacherCourseIds,
  teacherOwnsCourse,
  teacherOwnsRow,
} from '../_shared/teacherAuth.ts';
import { getStudentFromRequest } from '../_shared/studentAuth.ts';
import { attachSectionDueDates, fetchOverridesByWorkId, replaceSectionDueDates, resolveDueDates } from '../_shared/sectionDueDates.ts';
import { propagateToLinkedCourses } from '../_shared/courseLinks.ts';

// Fields that must NEVER be sent to a student who is actively taking an exam -
// showing these would just be handing out the answers.
function stripAnswerKeys(assignment: Record<string, any>) {
  const clean = { ...assignment };
  delete clean.answer_key_url;
  clean.questions = (assignment.questions || []).map((q: Record<string, any>) => {
    const { answer_key_html, answer_key_image_url, ...restQ } = q;
    return {
      ...restQ,
      parts: (q.parts || []).map((p: Record<string, any>) => {
        const { answer_key_html: _ak, answer_key_image_url: _aki, ...restP } = p;
        return restP;
      }),
    };
  });
  return clean;
}

// For the "check my score" lookup: answer keys are only included if the
// teacher has actually turned show_answer_key on for that assignment.
// (The old app had a toggle for this that didn't actually do anything -
// this is the fix.)
function applyShowAnswerKeyGate(assignment: Record<string, any>) {
  if (assignment.show_answer_key) return assignment;
  return stripAnswerKeys(assignment);
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = createAdminClient();
    const body = await req.json();
    const { action } = body;

    // ---- Public, student-facing actions ----

    if (action === 'examGet') {
      const { data, error } = await admin
        .from('assignments')
        .select('*')
        .eq('id', body.id)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ results: [] });

      // A signed-in student on a block with its own due date sees THAT date,
      // not the assignment's base one. Anonymous/access-code students (no
      // token, or one that fails the school-domain check) fall back to the
      // base due_date unchanged - exactly the pre-existing behavior, since
      // there is no identity here to resolve a section from.
      const student = await getStudentFromRequest(req, admin);
      let resolved = data;
      if (student && data.course_id) {
        const { data: rosterRow } = await admin
          .from('roster_students')
          .select('section_id')
          .eq('course_id', data.course_id)
          .ilike('email', student.email)
          .maybeSingle();
        if (rosterRow?.section_id) {
          const overrides = await fetchOverridesByWorkId(admin, 'assignment_id', [data.id]);
          [resolved] = resolveDueDates([data], overrides, () => rosterRow.section_id);
        }
      }
      return json({ results: [stripAnswerKeys(resolved)] });
    }

    if (action === 'listFeatured') {
      const { data, error } = await admin
        .from('assignments')
        .select('*')
        .eq('featured', true)
        .eq('is_active', true);
      if (error) return json({ error: error.message }, 500);
      return json({ results: (data || []).map(stripAnswerKeys) });
    }

    if (action === 'scoreLookupList') {
      const { data, error } = await admin.from('assignments').select('*');
      if (error) return json({ error: error.message }, 500);
      return json({ results: (data || []).map(applyShowAnswerKeyGate) });
    }

    // ---- Teacher-only actions ----

    const teacher = await getTeacherFromRequest(req, admin);
    if (!teacher) return json({ error: 'Unauthorized' }, 401);

    if (action === 'list') {
      const column = body.sort?.column || 'created_at';
      const ascending = body.sort?.ascending ?? false;
      const mine = await teacherCourseIds(admin, teacher.id);
      if (mine.length === 0) return json({ results: [] });
      const { data, error } = await admin
        .from('assignments')
        .select('*')
        .in('course_id', mine)
        .order(column, { ascending });
      if (error) return json({ error: error.message }, 500);
      // The form hydrates its per-section rows from this when editing.
      return json({ results: await attachSectionDueDates(admin, 'assignment_id', data || []) });
    }

    if (action === 'create') {
      if (!(await teacherOwnsCourse(admin, teacher.id, body.data?.course_id))) {
        return json({ error: 'Pick one of your own courses for this assignment.' }, 403);
      }
      // Not a real column on assignments - stored in its own table, keyed to
      // the row created below.
      const { section_due_dates, ...insertData } = body.data || {};
      const { data, error } = await admin
        .from('assignments')
        .insert(insertData)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      const { error: sddErr } = await replaceSectionDueDates(admin, 'assignment_id', data.id, section_due_dates);
      if (sddErr) return json({ error: sddErr }, 500);
      await propagateToLinkedCourses(admin, 'assignments', data);
      const [withOverrides] = await attachSectionDueDates(admin, 'assignment_id', [data]);
      return json({ result: withOverrides });
    }

    if (action === 'update') {
      if (!(await teacherOwnsRow(admin, teacher.id, 'assignments', body.id))) {
        return json({ error: 'Not found' }, 404);
      }
      if (body.data?.course_id && !(await teacherOwnsCourse(admin, teacher.id, body.data.course_id))) {
        return json({ error: 'Pick one of your own courses for this assignment.' }, 403);
      }
      const { section_due_dates, ...updateData } = body.data || {};
      if (section_due_dates !== undefined) {
        const { error: sddErr } = await replaceSectionDueDates(admin, 'assignment_id', body.id, section_due_dates);
        if (sddErr) return json({ error: sddErr }, 500);
      }
      const { data, error } = await admin
        .from('assignments')
        .update(updateData)
        .eq('id', body.id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      const [withOverrides] = await attachSectionDueDates(admin, 'assignment_id', [data]);
      return json({ result: withOverrides });
    }

    if (action === 'delete') {
      if (!(await teacherOwnsRow(admin, teacher.id, 'assignments', body.id))) {
        return json({ error: 'Not found' }, 404);
      }
      const { error } = await admin.from('assignments').delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
