import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import {
  createAdminClient,
  getTeacherFromRequest,
  teacherOwnsCourse,
  teacherOwnsLoopRow,
} from '../_shared/teacherAuth.ts';
import { findOrCreateUnit, linkedTeacherIds } from '../_shared/courseLinks.ts';

// Bank items are teacher-scoped, not course-scoped (see 0030_loop_practice.sql),
// so they can't use propagateToLinkedCourses directly - there's no
// row.course_id to match a course_links row against. linkedTeacherIds bridges
// that: every colleague who has a course linked FROM one of mine gets a copy
// of the item too, keyed by their own teacher_id. Best-effort/silent on
// failure, same discipline as propagateToLinkedCourses - a colleague's copy
// failing to land must never turn into an error on the teacher's own save.
async function propagateLoopProblem(admin: any, teacherId: string, row: Record<string, any>): Promise<void> {
  try {
    const targets = await linkedTeacherIds(admin, teacherId);
    if (targets.length === 0) return;
    const { id, teacher_id, created_at, updated_at, ...rest } = row;
    for (const targetTeacherId of targets) {
      const { error } = await admin
        .from('loop_problems')
        .upsert({ ...rest, teacher_id: targetTeacherId }, { onConflict: 'teacher_id,source_key' });
      if (error) console.error(`propagateLoopProblem -> ${targetTeacherId}: ${error.message}`);
    }
  } catch (e) {
    console.error(`propagateLoopProblem threw: ${(e as Error).message}`);
  }
}

// A course-scoped assignment follows the exact same course_links path as
// assignments/coding_problems/projects (unit matched by name, forced
// inactive) - just with teacher_id additionally overridden per target course's
// owner, since loop_assignments (unlike those tables) carries a real
// teacher_id column. A standalone assignment (no course_id) has no course to
// key a link off of, so it goes straight to every linked colleague instead,
// same as a bank item.
async function propagateLoopAssignment(admin: any, teacherId: string, row: Record<string, any>): Promise<void> {
  try {
    const { id, teacher_id, created_at, updated_at, ...rest } = row;
    if (row.course_id) {
      const { data: links } = await admin
        .from('course_links')
        .select('target_course_id')
        .eq('source_course_id', row.course_id);
      for (const link of links || []) {
        try {
          const { data: targetCourse } = await admin
            .from('courses')
            .select('teacher_id')
            .eq('id', link.target_course_id)
            .maybeSingle();
          if (!targetCourse) continue;
          let sourceUnitName: string | null = null;
          if (row.unit_id) {
            const { data: unit } = await admin.from('units').select('name').eq('id', row.unit_id).maybeSingle();
            sourceUnitName = unit?.name || null;
          }
          const targetUnitId = await findOrCreateUnit(admin, link.target_course_id, sourceUnitName);
          const { course_id, unit_id, ...withoutCourse } = rest;
          const { error } = await admin.from('loop_assignments').insert({
            ...withoutCourse,
            teacher_id: targetCourse.teacher_id,
            course_id: link.target_course_id,
            unit_id: targetUnitId,
            is_active: false,
          });
          if (error) console.error(`propagateLoopAssignment -> ${link.target_course_id}: ${error.message}`);
        } catch (e) {
          console.error(`propagateLoopAssignment -> ${link.target_course_id} threw: ${(e as Error).message}`);
        }
      }
    } else {
      const targets = await linkedTeacherIds(admin, teacherId);
      const { course_id, unit_id, ...withoutCourse } = rest;
      for (const targetTeacherId of targets) {
        const { error } = await admin.from('loop_assignments').insert({
          ...withoutCourse,
          teacher_id: targetTeacherId,
          course_id: null,
          unit_id: null,
          is_active: false,
        });
        if (error) console.error(`propagateLoopAssignment (standalone) -> ${targetTeacherId}: ${error.message}`);
      }
    }
  } catch (e) {
    console.error(`propagateLoopAssignment threw: ${(e as Error).message}`);
  }
}

// Students get the loop's code (trace) or the target output plus the 4
// choices (multiple_choice), but never the answer key: expected_output for
// a trace item, or which choice is correct / why a distractor is tempting
// for a multiple_choice one. Grading happens server-side in
// submissions/index.ts's submitLoopAnswer, which re-loads the real row.
//
// Choices are shuffled here rather than trusting authored order - the
// generated bank consistently lists the correct choice first, so serving it
// unshuffled would just teach "always pick the first option." Each shuffled
// choice keeps its ORIGINAL array index as `choice_index` - not sensitive on
// its own (it doesn't say which one is correct), and it's what the student's
// answer is graded against.
function sanitizeProblemForStudent(problem: Record<string, any>) {
  const base = {
    id: problem.id,
    type: problem.type,
    topic: problem.topic,
    difficulty: problem.difficulty,
  };
  // multiple_choice has no single "the code" - each choice carries its own,
  // and the top-level `code` column is trace-only.
  if (problem.type === 'trace') return { ...base, code: problem.code };
  const choices = (problem.choices || []).map((c: Record<string, any>, i: number) => ({
    choice_index: i,
    code: c.code,
  }));
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { ...base, shown_output: problem.shown_output, choices };
}

function matchesFilters(problem: Record<string, any>, assignment: Record<string, any>) {
  if (assignment.type_filter && assignment.type_filter !== 'both' && problem.type !== assignment.type_filter) {
    return false;
  }
  if (Array.isArray(assignment.topic_filter) && assignment.topic_filter.length > 0) {
    if (!assignment.topic_filter.includes(problem.topic)) return false;
  }
  if (Array.isArray(assignment.difficulty_filter) && assignment.difficulty_filter.length > 0) {
    if (!assignment.difficulty_filter.includes(problem.difficulty)) return false;
  }
  return true;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = createAdminClient();
    const body = await req.json();
    const { action } = body;

    // ---- Public / student-facing ----

    if (action === 'listAvailable') {
      const { data, error } = await admin
        .from('loop_assignments')
        .select('id, title, course_id, unit_id, target_score, wrong_penalty, due_date, courses(name)')
        .eq('is_active', true);
      if (error) return json({ error: error.message }, 500);
      return json({ results: data || [] });
    }

    if (action === 'getProblemToAttempt') {
      const { loop_assignment_id, exclude_id } = body;
      if (!loop_assignment_id) return json({ error: 'loop_assignment_id is required' }, 400);
      const { data: assignment } = await admin
        .from('loop_assignments')
        .select('*')
        .eq('id', loop_assignment_id)
        .eq('is_active', true)
        .maybeSingle();
      if (!assignment) return json({ error: 'Assignment not found or no longer active.' }, 404);

      const { data: pool, error } = await admin
        .from('loop_problems')
        .select('*')
        .eq('teacher_id', assignment.teacher_id)
        .eq('is_active', true);
      if (error) return json({ error: error.message }, 500);

      let candidates = (pool || []).filter((p) => matchesFilters(p, assignment));
      if (candidates.length === 0) return json({ error: 'No practice items match this assignment yet.' }, 409);
      if (exclude_id && candidates.length > 1) {
        candidates = candidates.filter((p) => p.id !== exclude_id);
      }
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      return json({ result: sanitizeProblemForStudent(picked) });
    }

    // ---- Teacher-only ----

    const teacher = await getTeacherFromRequest(req, admin);
    if (!teacher) return json({ error: 'Unauthorized' }, 401);

    if (action === 'listProblems') {
      const { data, error } = await admin
        .from('loop_problems')
        .select('*')
        .eq('teacher_id', teacher.id)
        .order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ results: data || [] });
    }

    if (action === 'createProblem') {
      const { data, error } = await admin
        .from('loop_problems')
        .insert({ ...body.data, teacher_id: teacher.id })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      await propagateLoopProblem(admin, teacher.id, data);
      return json({ result: data });
    }

    if (action === 'updateProblem') {
      if (!(await teacherOwnsLoopRow(admin, teacher.id, 'loop_problems', body.id))) {
        return json({ error: 'Not found' }, 404);
      }
      const { data, error } = await admin
        .from('loop_problems')
        .update(body.data)
        .eq('id', body.id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'deleteProblem') {
      if (!(await teacherOwnsLoopRow(admin, teacher.id, 'loop_problems', body.id))) {
        return json({ error: 'Not found' }, 404);
      }
      const { error } = await admin.from('loop_problems').delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // Accepts the AI-generated bank JSON verbatim: [{id, type, topic,
    // difficulty, code, expected_output}] or [{..., shown_output, choices}].
    // Upserts on (teacher_id, source_key) so re-pasting an updated batch
    // doesn't duplicate rows already imported.
    if (action === 'bulkImportProblems') {
      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) return json({ error: 'items must be a non-empty array' }, 400);
      const rows = items.map((it: Record<string, any>) => ({
        teacher_id: teacher.id,
        source_key: it.id ?? null,
        type: it.type,
        topic: it.topic,
        difficulty: it.difficulty,
        code: it.code,
        expected_output: it.expected_output ?? null,
        shown_output: it.shown_output ?? null,
        choices: it.choices ?? null,
      }));
      const { data, error } = await admin
        .from('loop_problems')
        .upsert(rows, { onConflict: 'teacher_id,source_key' })
        .select();
      if (error) return json({ error: error.message }, 500);
      for (const row of data || []) {
        await propagateLoopProblem(admin, teacher.id, row);
      }
      return json({ results: data || [], imported: data?.length ?? 0 });
    }

    if (action === 'listAssignments') {
      const { data, error } = await admin
        .from('loop_assignments')
        .select('*')
        .eq('teacher_id', teacher.id)
        .order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ results: data || [] });
    }

    if (action === 'createAssignment') {
      if (body.data?.course_id && !(await teacherOwnsCourse(admin, teacher.id, body.data.course_id))) {
        return json({ error: 'Pick one of your own courses for this assignment.' }, 403);
      }
      const { data, error } = await admin
        .from('loop_assignments')
        .insert({ ...body.data, teacher_id: teacher.id })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      await propagateLoopAssignment(admin, teacher.id, data);
      return json({ result: data });
    }

    if (action === 'updateAssignment') {
      if (!(await teacherOwnsLoopRow(admin, teacher.id, 'loop_assignments', body.id))) {
        return json({ error: 'Not found' }, 404);
      }
      if (body.data?.course_id && !(await teacherOwnsCourse(admin, teacher.id, body.data.course_id))) {
        return json({ error: 'Pick one of your own courses for this assignment.' }, 403);
      }
      const { data, error } = await admin
        .from('loop_assignments')
        .update(body.data)
        .eq('id', body.id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'deleteAssignment') {
      if (!(await teacherOwnsLoopRow(admin, teacher.id, 'loop_assignments', body.id))) {
        return json({ error: 'Not found' }, 404);
      }
      const { error } = await admin.from('loop_assignments').delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
