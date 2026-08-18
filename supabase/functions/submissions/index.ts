import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest, teacherCourseIds, teacherOwnsRow } from '../_shared/teacherAuth.ts';
import { getStudentFromRequest } from '../_shared/studentAuth.ts';
import { extractGistId, fetchGistJavaFiles, fetchGistUpdatedAt } from '../_shared/gist.ts';

function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 - avoids ambiguity
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Project feedback is withheld until the teacher releases it. This has to
// happen server-side: hiding it in the UI still ships the text to the
// browser, where anyone holding the access code could read it out of the
// network response - and unreleased review text may be AI-generated and not
// yet checked by a human. Only projects are gated; FRQ and coding
// submissions have always shown their score as soon as one exists.
function withheldIfUnreleased(row: Record<string, any> | null) {
  if (!row || !row.project_id || row.feedback_released) return row;
  // line_comments is feedback too - notes pinned to lines of the student's
  // code - so it has to be withheld on the same terms as the score and the
  // written review. Added when Projects gained line comments; without it the
  // one kind of project feedback that is written straight onto their code
  // would have been the only kind that leaked before release.
  return { ...row, score: null, teacher_comments: null, line_comments: [] };
}

// Verifies the caller actually owns this submission before allowing any
// read/write of it. Two ownership models coexist:
//  - student_user_id set (new, Google-signed-in students): the caller's JWT
//    must resolve (via getStudentFromRequest) to that same user.
//  - student_user_id null (legacy/anonymous rows created before sign-in was
//    required): fall back to the original session_token check, so anything
//    already in progress at rollout keeps working untouched.
async function verifyOwnership(
  admin: any,
  submissionId: string,
  sessionToken: string,
  student: { id: string } | null
) {
  const { data, error } = await admin
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.student_user_id) {
    if (!student || data.student_user_id !== student.id) return null;
  } else {
    if (data.session_token !== sessionToken) return null;
  }
  return data;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = createAdminClient();
    const body = await req.json();
    const { action } = body;

    // ============ Student-facing actions ============
    // Sign-in with a school Google account is required to start new work.
    // Resolved once per request; null if there's no valid student JWT.
    const student = await getStudentFromRequest(req, admin);

    if (action === 'startFresh') {
      const { assignment_id, coding_problem_id } = body;
      if (!student) return json({ error: 'Please sign in with your school Google account to continue.' }, 401);
      if (!assignment_id && !coding_problem_id) {
        return json({ error: 'One of assignment_id/coding_problem_id is required' }, 400);
      }

      // A student who already has a row for this assignment - submitted or
      // not - gets it back rather than a second, blank one. The client only
      // ever asks for an UNSUBMITTED row before deciding to create one
      // (findMyOpenSubmission), so simply revisiting the assignment's start
      // link after already turning it in - an old bookmark, clicking the
      // link again from an email - fell through to here and silently
      // created an orphaned duplicate every time. That is what actually made
      // a submission look like it had several "attempts": most were never
      // real second tries, just the same visit repeated. Checked before the
      // is_active/due_date gate below, so a student can still get back to
      // their own work even if the teacher deactivates the assignment
      // afterward - those checks exist to stop a new start, not to lock
      // someone out of what they already turned in.
      const { data: existingAny } = await admin
        .from('submissions')
        .select('*')
        .eq('student_user_id', student.id)
        .eq(assignment_id ? 'assignment_id' : 'coding_problem_id', assignment_id || coding_problem_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingAny) return json({ result: existingAny });

      // is_active / due_date used to be enforced only in StudentEntry.jsx, which
      // a bookmarked /exam?id=... URL skips entirely - so a student could start
      // and submit a closed or past-due assignment just by reusing an old link.
      // Checked here because this is where new work actually begins. Deliberately
      // NOT checked on read or on submitFinal: a student already mid-exam should
      // be able to finish and submit even if the deadline passes while they work.
      if (assignment_id) {
        const { data: asgn } = await admin
          .from('assignments')
          .select('is_active, due_date')
          .eq('id', assignment_id)
          .maybeSingle();
        if (!asgn) return json({ error: 'Assignment not found.' }, 404);
        if (!asgn.is_active) return json({ error: 'This assignment is no longer active.' }, 409);
        if (asgn.due_date && new Date(asgn.due_date) < new Date()) {
          return json({ error: 'This assignment is past its due date.' }, 409);
        }
      }

      if (coding_problem_id) {
        const { data: prob } = await admin
          .from('coding_problems')
          .select('is_active')
          .eq('id', coding_problem_id)
          .maybeSingle();
        if (!prob) return json({ error: 'Problem not found.' }, 404);
        if (!prob.is_active) return json({ error: 'This problem is no longer active.' }, 409);
      }

      const { data, error } = await admin
        .from('submissions')
        .insert({
          assignment_id: assignment_id || null,
          coding_problem_id: coding_problem_id || null,
          student_name: student.name,
          student_user_id: student.id,
          student_email: student.email,
          responses: body.initial_responses || {},
          submitted: false,
          access_code: generateAccessCode(),
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'findMyOpenSubmission') {
      const { assignment_id, coding_problem_id } = body;
      if (!student) return json({ result: null });
      let query = admin.from('submissions').select('*').eq('student_user_id', student.id).eq('submitted', false);
      query = assignment_id ? query.eq('assignment_id', assignment_id) : query.eq('coding_problem_id', coding_problem_id);
      // Not maybeSingle(): that throws when more than one row comes back, which
      // would lock a student out of their own work entirely. Two open rows
      // shouldn't happen (this is checked before startFresh inserts) but a
      // double-click can race one in - resuming the newest is a far better
      // failure mode than an error page.
      const { data, error } = await query.order('created_at', { ascending: false }).limit(1);
      if (error) return json({ error: error.message }, 500);
      return json({ result: data?.[0] ?? null });
    }

    if (action === 'myProjectSubmission') {
      const { project_id } = body;
      if (!student || !project_id) return json({ result: null });
      const { data, error } = await admin
        .from('submissions')
        .select('*')
        .eq('project_id', project_id)
        .eq('student_user_id', student.id)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ result: withheldIfUnreleased(data) });
    }

    if (action === 'myScores') {
      if (!student) return json({ error: 'Please sign in with your school Google account to continue.' }, 401);
      const { data, error } = await admin
        .from('submissions')
        .select('*')
        .eq('student_user_id', student.id)
        .eq('submitted', true)
        .order('submitted_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ results: (data || []).map(withheldIfUnreleased) });
    }

    if (action === 'resume') {
      const sub = await verifyOwnership(admin, body.submission_id, body.session_token, student);
      if (!sub) return json({ result: null }); // client falls back to startFresh
      if (sub.submitted) return json({ result: null }); // can't "resume" a finished submission
      return json({ result: sub });
    }

    if (action === 'saveResponses') {
      const sub = await verifyOwnership(admin, body.submission_id, body.session_token, student);
      if (!sub) return json({ error: 'Unauthorized' }, 401);
      if (sub.submitted) return json({ error: 'Already submitted' }, 409);
      // Only write what the caller actually sent. An FRQ autosave carries
      // responses and a coding autosave carries code; writing the absent one
      // as undefined/null would wipe the other kind of work.
      const draft: Record<string, unknown> = {};
      if (body.responses !== undefined) draft.responses = body.responses;
      if (typeof body.code === 'string') draft.code = body.code;
      if (Object.keys(draft).length === 0) return json({ result: sub });
      const { data, error } = await admin
        .from('submissions')
        .update(draft)
        .eq('id', body.submission_id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'submitFinal') {
      const sub = await verifyOwnership(admin, body.submission_id, body.session_token, student);
      if (!sub) return json({ error: 'Unauthorized' }, 401);
      if (sub.submitted) return json({ result: sub }); // idempotent - already submitted
      // `code` is what a hand-graded Coding Assignment turns in, and it was
      // simply missing here: this handler was written when the only thing a
      // student submitted was FRQ responses, and autograded problems get their
      // code written by run-java-tests instead. So a Coding Assignment's code
      // never reached the database from any path, and the teacher opened an
      // empty submission every time.
      const patch: Record<string, unknown> = {
        submitted: true,
        submitted_at: new Date().toISOString(),
        time_spent_seconds: body.time_spent_seconds ?? null,
      };
      if (body.responses !== undefined) patch.responses = body.responses;
      if (typeof body.code === 'string') patch.code = body.code;
      const { data, error } = await admin
        .from('submissions')
        .update(patch)
        .eq('id', body.submission_id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    // Turning the same work in again, before anyone has graded it. Flips the
    // student's own row back to open and leaves the code in place, so the
    // editor reopens with what they had rather than a blank page.
    //
    // Refused once a grade or feedback exists, and not for the teacher's
    // convenience: line comments are pinned to line NUMBERS in a frozen
    // snapshot, so letting the code change underneath them would silently move
    // every comment onto the wrong line. Reopening a graded submission has to
    // be a deliberate teacher action, not something a student can do.
    if (action === 'reopenMine') {
      const sub = await verifyOwnership(admin, body.submission_id, body.session_token, student);
      if (!sub) return json({ error: 'Unauthorized' }, 401);
      if (!sub.submitted) return json({ result: sub });
      const graded =
        sub.score !== null ||
        sub.autograde_score !== null ||
        !!(sub.teacher_comments || '').trim() ||
        (sub.line_comments || []).length > 0;
      if (graded) {
        return json(
          { error: 'This has already been graded. Ask your teacher if you need to turn it in again.' },
          409
        );
      }
      const { data, error } = await admin
        .from('submissions')
        .update({ submitted: false, submitted_at: null })
        .eq('id', body.submission_id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'startCoding') {
      const { coding_problem_id } = body;
      if (!student) return json({ error: 'Please sign in with your school Google account to continue.' }, 401);
      if (!coding_problem_id) return json({ error: 'coding_problem_id is required' }, 400);

      // See the identical check in startFresh - a student who already has a
      // row for this problem, submitted or not, gets it back rather than a
      // second blank one.
      const { data: existingAny } = await admin
        .from('submissions')
        .select('*')
        .eq('student_user_id', student.id)
        .eq('coding_problem_id', coding_problem_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingAny) return json({ result: existingAny });

      // Same reason as startFresh: a bookmarked /code-practice?id=... URL
      // skips the picker page where this was previously the only check.
      const { data: prob } = await admin
        .from('coding_problems')
        .select('is_active')
        .eq('id', coding_problem_id)
        .maybeSingle();
      if (!prob) return json({ error: 'Problem not found.' }, 404);
      if (!prob.is_active) return json({ error: 'This problem is no longer active.' }, 409);

      const { data, error } = await admin
        .from('submissions')
        .insert({
          coding_problem_id,
          student_name: student.name,
          student_user_id: student.id,
          student_email: student.email,
          submitted: false,
          access_code: generateAccessCode(),
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'submitProject') {
      const { project_id, gist_url } = body;
      if (!student) return json({ error: 'Please sign in with your school Google account to continue.' }, 401);
      if (!project_id || !gist_url) return json({ error: 'project_id and gist_url are required' }, 400);

      // A project turned inactive should stop accepting submissions, including
      // from a student holding a direct link. Due date is deliberately not
      // enforced here - late project work is flagged for the teacher rather
      // than rejected, so they can decide what to do with it.
      const { data: proj } = await admin
        .from('projects')
        .select('is_active')
        .eq('id', project_id)
        .maybeSingle();
      if (!proj) return json({ error: 'Project not found.' }, 404);
      if (!proj.is_active) return json({ error: 'This project is no longer accepting submissions.' }, 409);

      const gistId = extractGistId(gist_url);
      if (!gistId) return json({ error: "That doesn't look like a gist URL. It should look like https://gist.github.com/yourname/abc123..." }, 400);

      const fetched = await fetchGistJavaFiles(gistId);
      if ('error' in fetched) return json({ error: fetched.error }, 400);

      // Re-submitting (e.g. fixed a typo in the URL) overwrites the same row
      // rather than creating a second one - one submission per student per
      // project, always reflecting the last gist snapshot they submitted.
      const { data: existing } = await admin
        .from('submissions')
        .select('id')
        .eq('project_id', project_id)
        .eq('student_user_id', student.id)
        .maybeSingle();

      const row = {
        project_id,
        student_name: student.name,
        student_user_id: student.id,
        student_email: student.email,
        gist_url,
        files: fetched.files,
        gist_captured_at: new Date().toISOString(),
        gist_updated_at: fetched.gistUpdatedAt,
        submitted: true,
        submitted_at: new Date().toISOString(),
      };

      const query = existing
        ? admin.from('submissions').update(row).eq('id', existing.id)
        : admin.from('submissions').insert({ ...row, access_code: generateAccessCode() });
      const { data, error } = await query.select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    // ============ Public score lookup (access code = shared secret, same
    // model the old app used - unchanged, still works for pre-Google-sign-in
    // submissions and anyone who wants to look up an old code) ============

    if (action === 'getByAccessCode') {
      const trimmed = (body.access_code || '').trim().toUpperCase();
      const { data, error } = await admin
        .from('submissions')
        .select('*')
        .eq('access_code', trimmed)
        .eq('submitted', true)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ results: data ? [withheldIfUnreleased(data)] : [] });
    }

    // ============ Teacher-only actions ============

    const teacher = await getTeacherFromRequest(req, admin);
    if (!teacher) return json({ error: 'Unauthorized' }, 401);

    // Submissions are owned transitively: a submission belongs to a piece of
    // work, which belongs to a course, which belongs to a teacher. These two
    // resolve that chain so no action below can touch another teacher's
    // students. `myWorkIds` is one round trip and gets reused by every action.
    const myCourses = await teacherCourseIds(admin, teacher.id);
    const myWorkIds = async () => {
      if (myCourses.length === 0) return { assignments: [], coding: [], projects: [] };
      const [a, c, p] = await Promise.all([
        admin.from('assignments').select('id').in('course_id', myCourses),
        admin.from('coding_problems').select('id').in('course_id', myCourses),
        admin.from('projects').select('id').in('course_id', myCourses),
      ]);
      return {
        assignments: (a.data || []).map((r: Record<string, any>) => r.id),
        coding: (c.data || []).map((r: Record<string, any>) => r.id),
        projects: (p.data || []).map((r: Record<string, any>) => r.id),
      };
    };
    const ownsSubmissionRow = (s: Record<string, any>, ids: Awaited<ReturnType<typeof myWorkIds>>) =>
      (s.assignment_id && ids.assignments.includes(s.assignment_id)) ||
      (s.coding_problem_id && ids.coding.includes(s.coding_problem_id)) ||
      (s.project_id && ids.projects.includes(s.project_id));
    const ownsSubmissionId = async (submissionId: string) => {
      const { data } = await admin
        .from('submissions')
        .select('assignment_id, coding_problem_id, project_id')
        .eq('id', submissionId)
        .maybeSingle();
      if (!data) return false;
      return !!ownsSubmissionRow(data, await myWorkIds());
    };

    if (action === 'listForAssignment') {
      const ids = await myWorkIds();
      const requested = body.assignment_id || body.coding_problem_id || body.project_id;
      const allowed =
        (body.assignment_id && ids.assignments.includes(body.assignment_id)) ||
        (body.coding_problem_id && ids.coding.includes(body.coding_problem_id)) ||
        (body.project_id && ids.projects.includes(body.project_id));
      if (!requested || !allowed) return json({ results: [] });

      const column = body.sort?.column || 'submitted_at';
      const ascending = body.sort?.ascending ?? false;
      let query = admin.from('submissions').select('*').eq('submitted', true);
      if (body.assignment_id) query = query.eq('assignment_id', body.assignment_id);
      if (body.coding_problem_id) query = query.eq('coding_problem_id', body.coding_problem_id);
      if (body.project_id) query = query.eq('project_id', body.project_id);
      const { data, error } = await query.order(column, { ascending });
      if (error) return json({ error: error.message }, 500);
      return json({ results: data || [] });
    }

    if (action === 'listAllSubmitted') {
      // used for the "generate missing access codes" backfill
      const ids = await myWorkIds();
      const { data, error } = await admin.from('submissions').select('*').eq('submitted', true);
      if (error) return json({ error: error.message }, 500);
      return json({ results: (data || []).filter((s: Record<string, any>) => ownsSubmissionRow(s, ids)) });
    }

    // Which of this teacher's own work is actually gradeable right now.
    // Needed by both actions below. Two separate reasons a piece of work is
    // excluded: an autograded Mini Problem gets its autograde_score the
    // instant it is submitted and can never be "waiting on a human", so a
    // null `score` on one means nothing - only a `review` problem's null
    // score is really a submission sitting in the pile. Separately, a teacher
    // can mark a whole assignment/problem/project as one they are not
    // grading at all (see 0017_work_level_skip_grading.sql) - the usual real
    // pattern being "if I'm not grading it for one student I'm not grading it
    // for the class", so this is a decision made once on the work rather than
    // repeated per submission.
    const myGradableWorkIds = async () => {
      const ids = await myWorkIds();
      const [a, p, c] = await Promise.all([
        ids.assignments.length
          ? admin.from('assignments').select('id, grading_skipped').in('id', ids.assignments)
          : Promise.resolve({ data: [] }),
        ids.projects.length
          ? admin.from('projects').select('id, grading_skipped').in('id', ids.projects)
          : Promise.resolve({ data: [] }),
        ids.coding.length
          ? admin.from('coding_problems').select('id, grading_kind, grading_skipped').in('id', ids.coding)
          : Promise.resolve({ data: [] }),
      ]);
      return {
        assignments: new Set(
          (a.data || []).filter((r: Record<string, any>) => !r.grading_skipped).map((r: Record<string, any>) => r.id)
        ),
        projects: new Set(
          (p.data || []).filter((r: Record<string, any>) => !r.grading_skipped).map((r: Record<string, any>) => r.id)
        ),
        reviewProblems: new Set(
          (c.data || [])
            .filter((r: Record<string, any>) => r.grading_kind === 'review' && !r.grading_skipped)
            .map((r: Record<string, any>) => r.id)
        ),
      };
    };

    // A student who resubmitted more than once before being graded (see
    // reopenMine) leaves several rows behind, all still unscored - they are
    // one person waiting on a grade, not several. Both actions below need to
    // collapse to one row per (work item, student) before counting or
    // listing anything. Keyed on the signed-in user where there is one,
    // falling back to email then name for rows predating sign-in - the same
    // key CodeReviewGrader already groups attempts by.
    const studentKey = (s: Record<string, any>) =>
      s.student_user_id || (s.student_email || '').toLowerCase() || s.student_name || s.id;

    // How much work is sitting there waiting on the teacher. Counted here
    // rather than by shipping every submission to the browser and filtering
    // client-side. `grading_skipped` submissions are excluded, and so is
    // anything belonging to work marked not-graded at all - a teacher who has
    // deliberately decided not to grade something should not keep seeing it
    // nag at them from every badge in the app.
    if (action === 'gradingCounts') {
      const ids = await myWorkIds();
      const [{ data, error }, gradable] = await Promise.all([
        admin
          .from('submissions')
          .select('assignment_id, project_id, coding_problem_id, score, student_user_id, student_email, student_name')
          .eq('submitted', true)
          .eq('grading_skipped', false)
          .is('score', null),
        myGradableWorkIds(),
      ]);
      if (error) return json({ error: error.message }, 500);
      const owned = (data || []).filter((s: Record<string, any>) => ownsSubmissionRow(s, ids));

      const byAssignment: Record<string, number> = {};
      const byProject: Record<string, number> = {};
      const byCodingProblem: Record<string, number> = {};
      const seenKeys = new Set<string>();
      const bump = (bucket: Record<string, number>, workId: string, row: Record<string, any>) => {
        const key = `${workId}::${studentKey(row)}`;
        if (seenKeys.has(key)) return; // a resubmission from the same student - already counted
        seenKeys.add(key);
        bucket[workId] = (bucket[workId] || 0) + 1;
      };
      for (const row of owned) {
        if (row.assignment_id && gradable.assignments.has(row.assignment_id)) bump(byAssignment, row.assignment_id, row);
        else if (row.project_id && gradable.projects.has(row.project_id)) bump(byProject, row.project_id, row);
        else if (row.coding_problem_id && gradable.reviewProblems.has(row.coding_problem_id)) bump(byCodingProblem, row.coding_problem_id, row);
      }
      return json({ result: { byAssignment, byProject, byCodingProblem } });
    }

    // The full "needs grading" list behind the dashboard's Needs Grading
    // panel - one row per (work item, student) this teacher owns, their most
    // recent still-unscored attempt if they submitted more than once.
    // Submissions individually marked grading_skipped are still included
    // (the panel shows both piles and lets a teacher move something between
    // them) - but anything belonging to work marked not-graded at the
    // assignment level is left out entirely, not shown in either pile, since
    // that decision was about the whole class, not about any one submission
    // worth surfacing for review.
    if (action === 'listNeedsGrading') {
      const ids = await myWorkIds();
      const [{ data, error }, gradable] = await Promise.all([
        admin
          .from('submissions')
          .select(
            'id, assignment_id, project_id, coding_problem_id, student_name, student_user_id, student_email, submitted_at, grading_skipped'
          )
          // Newest first, so the first row kept per (work, student) below is
          // their most recent attempt.
          .eq('submitted', true)
          .is('score', null)
          .order('submitted_at', { ascending: false }),
        myGradableWorkIds(),
      ]);
      if (error) return json({ error: error.message }, 500);
      const owned = (data || []).filter((s: Record<string, any>) => ownsSubmissionRow(s, ids));

      const seenKeys = new Set<string>();
      const deduped: Record<string, any>[] = [];
      for (const s of owned) {
        let kind: string;
        let workId: string;
        if (s.assignment_id && gradable.assignments.has(s.assignment_id)) { kind = 'frq'; workId = s.assignment_id; }
        else if (s.project_id && gradable.projects.has(s.project_id)) { kind = 'project'; workId = s.project_id; }
        else if (s.coding_problem_id && gradable.reviewProblems.has(s.coding_problem_id)) { kind = 'review'; workId = s.coding_problem_id; }
        else continue; // autograded, or the whole assignment/problem/project is marked not-graded
        const key = `${workId}::${studentKey(s)}`;
        if (seenKeys.has(key)) continue; // an earlier, superseded attempt from the same student
        seenKeys.add(key);
        deduped.push({ ...s, kind, work_id: workId });
      }
      // Oldest-waiting-first for display, same ordering as before dedup.
      deduped.sort(
        (a, b) => new Date(a.submitted_at ?? 0).getTime() - new Date(b.submitted_at ?? 0).getTime()
      );

      const uniq = (arr: (string | null)[]) => [...new Set(arr.filter(Boolean))] as string[];
      const [assignmentRows, projectRows, codingRows] = await Promise.all([
        admin.from('assignments').select('id, title, course_id').in('id', uniq(deduped.map((s) => s.assignment_id))),
        admin.from('projects').select('id, title, course_id').in('id', uniq(deduped.map((s) => s.project_id))),
        admin
          .from('coding_problems')
          .select('id, title, course_id')
          .in('id', uniq(deduped.map((s) => s.coding_problem_id))),
      ]);
      const titleMap = new Map(
        [...(assignmentRows.data || []), ...(projectRows.data || []), ...(codingRows.data || [])].map(
          (r: Record<string, any>) => [r.id, { title: r.title, course_id: r.course_id }]
        )
      );

      const results = [];
      for (const s of deduped) {
        const meta = titleMap.get(s.work_id);
        if (!meta) continue; // work item since deleted
        results.push({
          id: s.id,
          kind: s.kind,
          work_id: s.work_id,
          course_id: meta.course_id,
          title: meta.title,
          student_name: s.student_name,
          submitted_at: s.submitted_at,
          grading_skipped: s.grading_skipped,
        });
      }
      return json({ results });
    }

    if (action === 'saveGrade') {
      if (!(await ownsSubmissionId(body.submission_id))) return json({ error: 'Not found' }, 404);
      const update: Record<string, unknown> = {};
      if (body.score !== undefined) update.score = body.score;
      if (body.question_scores !== undefined) update.question_scores = body.question_scores;
      if (body.part_comments !== undefined) update.part_comments = body.part_comments;
      if (body.style_score !== undefined) update.style_score = body.style_score;
      if (body.style_comments !== undefined) update.style_comments = body.style_comments;
      if (body.teacher_comments !== undefined) update.teacher_comments = body.teacher_comments;
      if (body.feedback_released !== undefined) update.feedback_released = body.feedback_released;
      // Written feedback pinned to specific lines of a hand-graded submission.
      if (body.line_comments !== undefined) update.line_comments = body.line_comments;
      // "Not grading this one" - a duplicate, an empty placeholder, a student
      // who dropped. Leaves score untouched: this removes it from the pile,
      // it does not grade it as a zero.
      if (body.grading_skipped !== undefined) update.grading_skipped = body.grading_skipped;
      const { data, error } = await admin
        .from('submissions')
        .update(update)
        .eq('id', body.submission_id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'setAccessCode') {
      if (!(await ownsSubmissionId(body.submission_id))) return json({ error: 'Not found' }, 404);
      const { data, error } = await admin
        .from('submissions')
        .update({ access_code: body.access_code })
        .eq('id', body.submission_id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'delete') {
      if (!(await ownsSubmissionId(body.submission_id))) return json({ error: 'Not found' }, 404);
      const { error } = await admin.from('submissions').delete().eq('id', body.submission_id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // Re-fetches each submitted gist's metadata (not its file bodies) and
    // reports any whose updated_at is now newer than what we recorded when we
    // snapshotted it - i.e. the student edited the gist after turning it in.
    // Deliberately a factual "this changed, here is when" signal rather than
    // any inference about why.
    if (action === 'recheckGists') {
      const { project_id } = body;
      if (!project_id) return json({ error: 'project_id is required' }, 400);
      if (!(await teacherOwnsRow(admin, teacher.id, 'projects', project_id))) {
        return json({ error: 'Not found' }, 404);
      }

      const { data: subs, error } = await admin
        .from('submissions')
        .select('id, student_name, gist_url, gist_updated_at, gist_captured_at')
        .eq('project_id', project_id)
        .eq('submitted', true);
      if (error) return json({ error: error.message }, 500);

      const results: {
        submission_id: string;
        student_name: string;
        status: 'unchanged' | 'edited' | 'unknown' | 'error';
        current_updated_at?: string | null;
        error?: string;
      }[] = [];

      for (const s of subs || []) {
        const gistId = extractGistId(s.gist_url || '');
        if (!gistId) {
          results.push({ submission_id: s.id, student_name: s.student_name, status: 'error', error: 'Unrecognized gist URL' });
          continue;
        }
        const fetched = await fetchGistUpdatedAt(gistId);
        if ('error' in fetched) {
          results.push({ submission_id: s.id, student_name: s.student_name, status: 'error', error: fetched.error });
          continue;
        }
        // No baseline recorded (submitted before this was tracked) means we
        // genuinely cannot say - report that rather than implying "unchanged".
        if (!s.gist_updated_at) {
          results.push({
            submission_id: s.id,
            student_name: s.student_name,
            status: 'unknown',
            current_updated_at: fetched.updatedAt,
          });
          continue;
        }
        const edited = !!fetched.updatedAt && new Date(fetched.updatedAt) > new Date(s.gist_updated_at);
        results.push({
          submission_id: s.id,
          student_name: s.student_name,
          status: edited ? 'edited' : 'unchanged',
          current_updated_at: fetched.updatedAt,
        });
      }

      return json({ results });
    }

    // Lets a teacher seed a project's submissions from a name,gist_url CSV
    // instead of every student signing in individually - useful for testing
    // with an existing list of gists, or backfilling gists collected before
    // this site could accept them directly. These rows have no
    // student_user_id (nobody signed in to create them), so re-running the
    // same import updates by student_name instead of duplicating.
    if (action === 'bulkImportProject') {
      const { project_id, rows } = body;
      if (!project_id || !Array.isArray(rows)) {
        return json({ error: 'project_id and rows are required' }, 400);
      }
      if (!(await teacherOwnsRow(admin, teacher.id, 'projects', project_id))) {
        return json({ error: 'Not found' }, 404);
      }
      const results: { student_name: string; status: 'ok' | 'error'; error?: string }[] = [];
      for (const row of rows) {
        const studentName = (row.student_name || '').trim();
        const gistUrl = (row.gist_url || '').trim();
        if (!studentName || !gistUrl) {
          results.push({ student_name: studentName || '(blank)', status: 'error', error: 'Missing name or gist URL' });
          continue;
        }
        const gistId = extractGistId(gistUrl);
        if (!gistId) {
          results.push({ student_name: studentName, status: 'error', error: "Doesn't look like a gist URL" });
          continue;
        }
        const fetched = await fetchGistJavaFiles(gistId);
        if ('error' in fetched) {
          results.push({ student_name: studentName, status: 'error', error: fetched.error });
          continue;
        }

        const { data: existing } = await admin
          .from('submissions')
          .select('id')
          .eq('project_id', project_id)
          .is('student_user_id', null)
          .eq('student_name', studentName)
          .maybeSingle();

        const rowData = {
          project_id,
          student_name: studentName,
          gist_url: gistUrl,
          files: fetched.files,
          gist_captured_at: new Date().toISOString(),
          gist_updated_at: fetched.gistUpdatedAt,
          submitted: true,
          submitted_at: new Date().toISOString(),
        };
        const query = existing
          ? admin.from('submissions').update(rowData).eq('id', existing.id)
          : admin.from('submissions').insert({ ...rowData, access_code: generateAccessCode() });
        const { error } = await query;
        results.push(
          error ? { student_name: studentName, status: 'error', error: error.message } : { student_name: studentName, status: 'ok' }
        );
      }
      return json({ results });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
