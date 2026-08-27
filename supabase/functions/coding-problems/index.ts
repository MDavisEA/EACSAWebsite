import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import {
  createAdminClient,
  getTeacherFromRequest,
  teacherCourseIds,
  teacherOwnsCourse,
  teacherOwnsRow,
} from '../_shared/teacherAuth.ts';
import { getStudentFromRequest } from '../_shared/studentAuth.ts';

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
    // The student page needs to know there are no tests to run, so it can
    // offer a plain Run instead of "Run My Tests".
    grading_kind: problem.grading_kind || 'auto',
    // Students need to see how many practice runs they get; the cap itself is
    // enforced server-side in run-java-tests.
    max_test_runs: problem.max_test_runs,
    // What the finished program should look like when it runs. Not gated -
    // this describes the target, not a worked solution.
    sample_outputs: problem.sample_outputs || [],
    // The answer key is the answer, so it is only ever included once the
    // teacher has released it. This function is an allowlist - a new column is
    // invisible to students until named here - so this is the one place that
    // decision gets made. The second gate is on the client side of where it is
    // shown: a student only meets it on a submission they already turned in
    // (see StudentDashboard), so releasing early cannot hand the solution to
    // someone still working. The flag itself is safe to expose either way -
    // "there is a key you cannot see yet" is not a leak.
    answer_key_released: !!problem.answer_key_released,
    ...(problem.answer_key_released
      ? {
          answer_key_code: problem.answer_key_code || null,
          answer_key_notes_html: problem.answer_key_notes_html || null,
        }
      : {}),
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

// `points_possible` is the denominator students see on their score, and it is
// stored rather than computed on read - so anything that writes a problem
// without it leaves work that is worth "0 pts" to every student, quietly and
// wrongly. Derived here instead of trusting the caller to have done the sum:
// the teacher form always did, but nothing made that a rule, and a problem
// created any other way (a direct API call, a future importer) had no points
// at all.
//
// Only touched when the write actually carries the fields it is derived from,
// so a partial patch - flipping is_active, releasing a key - cannot zero it.
function withDerivedPoints(data: Record<string, any> | undefined) {
  if (!data) return data;
  const isReview = data.grading_kind === 'review';
  if (isReview) {
    if (!('manual_points' in data)) return data;
    return { ...data, points_possible: Number(data.manual_points) || 0 };
  }
  if (!Array.isArray(data.methods)) return data;
  const total = data.methods.reduce(
    (sum: number, m: Record<string, any>) =>
      sum +
      (Array.isArray(m?.test_cases) ? m.test_cases : []).reduce(
        (s: number, tc: Record<string, any>) => s + (Number(tc?.points) || 0),
        0
      ),
    0
  );
  return { ...data, points_possible: total };
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

    // Same sanitized shape as getActive, but for looking back at a piece of
    // work already turned in - MyScore and the "what I turned in" dialog on
    // the student dashboard, not for starting new work. is_active is
    // deliberately NOT checked here: it gates whether a student can begin or
    // continue a problem (enforced separately in submissions/index.ts's
    // startFresh), not whether they can see their own past submission or a
    // released answer key. The normal end-of-unit sequence is deactivate the
    // problem, then release the key - without this action that sequence
    // would silently hide the key from every student who already submitted.
    // No ownership check needed: this returns exactly the fields getActive
    // already hands to anyone with the id while the problem is active, so
    // dropping is_active removes no real boundary - the id itself isn't
    // guessable, and this endpoint has never gated on more than that.
    if (action === 'getForReview') {
      const { data, error } = await admin
        .from('coding_problems')
        .select('*')
        .eq('id', body.id)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ result: null });

      const sanitized = sanitizeForStudent(data);
      if (!data.answer_key_released) return json({ result: sanitized });

      // The answer key is the answer, so unlike everything else this action
      // returns, it is only handed back to someone who can prove they already
      // have a submission for this exact problem - the release flag alone is
      // not that proof, since the problem id is not secret (it is sitting in
      // the /code?id=... URL every student in the class already has, and this
      // action itself does not check is_active). This was previously missing
      // entirely: the design comment on the answer-key migration claimed "two
      // independent gates," but only the release flag was ever checked
      // server-side - anyone with the id could pull the key the moment a
      // teacher released it, submission or not.
      //
      // Two ways to prove it, matching the two ways this action is actually
      // reached: a signed-in student with their own row for this problem
      // (StudentDashboard), or - MyScore's access-code lookup, which has no
      // session - a submission id that genuinely belongs to this problem.
      // Submission ids are random UUIDs nobody can guess, so knowing one
      // already is the proof; no separate session_token check needed on top
      // of it for a read-only, non-destructive lookup like this.
      let hasSubmission = false;
      const student = await getStudentFromRequest(req, admin);
      if (student) {
        const { data: sub } = await admin
          .from('submissions')
          .select('id')
          .eq('coding_problem_id', body.id)
          .eq('student_user_id', student.id)
          .limit(1)
          .maybeSingle();
        hasSubmission = !!sub;
      } else if (body.submission_id) {
        const { data: sub } = await admin
          .from('submissions')
          .select('id')
          .eq('id', body.submission_id)
          .eq('coding_problem_id', body.id)
          .maybeSingle();
        hasSubmission = !!sub;
      }
      if (hasSubmission) return json({ result: sanitized });
      const { answer_key_code, answer_key_notes_html, ...withheld } = sanitized;
      return json({ result: withheld });
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
      const { data, error } = await admin
        .from('coding_problems')
        .insert(withDerivedPoints(body.data))
        .select()
        .single();
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
        .update(withDerivedPoints(body.data))
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
