import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import {
  createAdminClient,
  getTeacherFromRequest,
  teacherCourseIds,
  teacherOwnsCourse,
  teacherOwnsRow,
} from '../_shared/teacherAuth.ts';

// Students get starter code, description, and the LABELS of test cases
// (so they know what's being checked) but never expected_output, method_args,
// or which ones are hidden - that's exactly the info that would let someone
// game the autograder instead of solving the problem. A problem can test
// several methods, so checks are grouped per method rather than flattened.
function sanitizeForStudent(problem: Record<string, any>) {
  return {
    id: problem.id,
    title: problem.title,
    description_html: problem.description_html,
    language: problem.language,
    class_name: problem.class_name,
    starter_code: problem.starter_code,
    points_possible: problem.points_possible,
    // Students need to see how many practice runs they get; the cap itself is
    // enforced server-side in run-java-tests.
    max_test_runs: problem.max_test_runs,
    methods: (problem.methods || []).map((m: Record<string, any>) => ({
      method_name: m.method_name,
      // Not sensitive - it only says how the work is checked, which the check
      // labels already imply - and the student page needs it to avoid telling
      // a whole-program student to write `Solution.someMethod()`.
      harness_type: m.harness_type,
      visible_checks: (m.test_cases || [])
        .filter((tc: Record<string, any>) => !tc.hidden)
        .map((tc: Record<string, any>) => ({ id: tc.id, label: tc.label, points: tc.points })),
      hidden_check_count: (m.test_cases || []).filter((tc: Record<string, any>) => tc.hidden).length,
    })),
  };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = createAdminClient();
    const body = await req.json();
    const { action } = body;

    if (action === 'listActive') {
      const { data, error } = await admin.from('coding_problems').select('*').eq('is_active', true);
      if (error) return json({ error: error.message }, 500);
      return json({ results: (data || []).map(sanitizeForStudent) });
    }

    if (action === 'getActive') {
      const { data, error } = await admin
        .from('coding_problems')
        .select('*')
        .eq('id', body.id)
        .eq('is_active', true)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data ? sanitizeForStudent(data) : null });
    }

    // ---- Teacher-only ----

    const teacher = await getTeacherFromRequest(req, admin);
    if (!teacher) return json({ error: 'Unauthorized' }, 401);

    // Same sanitizer the student endpoint uses, so what the teacher previews
    // is byte-for-byte what a student would receive - including the hiding of
    // expected outputs and hidden-test details. Unlike getActive this ignores
    // is_active, because previewing is most useful before publishing.
    // Previewing is read-only and leaks nothing an enrolled student could not
    // already see, but it is still scoped: a teacher has no business reading
    // another teacher's unpublished problem.
    if (action === 'previewAsStudent') {
      if (!(await teacherOwnsRow(admin, teacher.id, 'coding_problems', body.id))) {
        return json({ error: 'Not found' }, 404);
      }
      const { data, error } = await admin
        .from('coding_problems')
        .select('*')
        .eq('id', body.id)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data ? sanitizeForStudent(data) : null });
    }

    if (action === 'list') {
      const mine = await teacherCourseIds(admin, teacher.id);
      if (mine.length === 0) return json({ results: [] });
      const { data, error } = await admin
        .from('coding_problems')
        .select('*')
        .in('course_id', mine)
        .order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ results: data || [] });
    }

    // Read-only view of what colleagues have built, for copying. Deliberately
    // not filtered to the caller's own courses - that is the point - but it
    // returns no student data and nothing here can be edited in place.
    if (action === 'listShared') {
      const mine = await teacherCourseIds(admin, teacher.id);
      const { data, error } = await admin
        .from('coding_problems')
        .select('id, title, description_html, points_possible, course_id, courses(name, teacher_id)')
        .order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);
      const others = (data || []).filter((p: Record<string, any>) => !mine.includes(p.course_id));
      return json({ results: others });
    }

    // Copies someone else's problem into one of MY units. The copy is a new
    // row I own; the original is untouched and stays theirs.
    if (action === 'copyToMyCourse') {
      if (!(await teacherOwnsCourse(admin, teacher.id, body.course_id))) {
        return json({ error: 'That course is not yours' }, 403);
      }
      const { data: src, error: srcErr } = await admin
        .from('coding_problems')
        .select('*')
        .eq('id', body.id)
        .maybeSingle();
      if (srcErr || !src) return json({ error: 'Not found' }, 404);
      const { id, created_at, ...rest } = src;
      const { data, error } = await admin
        .from('coding_problems')
        .insert({
          ...rest,
          title: `${src.title} (copy)`,
          course_id: body.course_id,
          unit_id: body.unit_id ?? null,
          is_active: false,
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'create') {
      if (!(await teacherOwnsCourse(admin, teacher.id, body.data?.course_id))) {
        return json({ error: 'Pick one of your own courses for this problem.' }, 403);
      }
      const { data, error } = await admin.from('coding_problems').insert(body.data).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'update') {
      // Checked twice on purpose: that the row is currently mine, and that
      // wherever it is being moved to is also mine - otherwise "move to
      // course" would be a way to hand work to someone else's class.
      if (!(await teacherOwnsRow(admin, teacher.id, 'coding_problems', body.id))) {
        return json({ error: 'Not found' }, 404);
      }
      if (
        body.data?.course_id &&
        !(await teacherOwnsCourse(admin, teacher.id, body.data.course_id))
      ) {
        return json({ error: 'Pick one of your own courses for this problem.' }, 403);
      }
      const { data, error } = await admin
        .from('coding_problems')
        .update(body.data)
        .eq('id', body.id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'delete') {
      if (!(await teacherOwnsRow(admin, teacher.id, 'coding_problems', body.id))) {
        return json({ error: 'Not found' }, 404);
      }
      const { error } = await admin.from('coding_problems').delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
