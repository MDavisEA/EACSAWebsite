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

    // Opening a project now records that they started it, the same way
    // startFresh/startCoding already do for an FRQ or a coding problem -
    // without this a project is indistinguishable from untouched work until
    // the moment a gist is submitted, so "hasn't opened it" and "working on
    // it" collapsed into one state for projects only.
    //
    // Idempotent: returns the existing row (submitted or not) rather than ever
    // creating a second one, which matters because submitProject looks its own
    // row up with maybeSingle() and would throw on a duplicate.
    if (action === 'startProject') {
      const { project_id } = body;
      if (!student) return json({ error: 'Please sign in with your school Google account to continue.' }, 401);
      if (!project_id) return json({ error: 'project_id is required' }, 400);

      const { data: existing } = await admin
        .from('submissions')
        .select('*')
        .eq('project_id', project_id)
        .eq('student_user_id', student.id)
        .maybeSingle();
      if (existing) return json({ result: withheldIfUnreleased(existing) });

      // Only for a project they can actually still work on - a direct link to
      // a deactivated project should not create anything.
      const { data: proj } = await admin
        .from('projects')
        .select('is_active')
        .eq('id', project_id)
        .maybeSingle();
      if (!proj || !proj.is_active) return json({ result: null });

      const { data, error } = await admin
        .from('submissions')
        .insert({
          project_id,
          student_name: student.name,
          student_user_id: student.id,
          student_email: student.email,
          submitted: false,
          access_code: generateAccessCode(),
        })
        .select()
        .single();
      if (error) {
        // Lost a race with another request for the same student+project (this
        // fires on page load, so two quick loads can overlap). The unique index
        // is what makes that safe; here it just means "someone else created it
        // first", so hand back the row that won rather than erroring.
        if ((error as Record<string, any>).code === '23505') {
          const { data: raced } = await admin
            .from('submissions')
            .select('*')
            .eq('project_id', project_id)
            .eq('student_user_id', student.id)
            .maybeSingle();
          if (raced) return json({ result: withheldIfUnreleased(raced) });
        }
        return json({ error: error.message }, 500);
      }
      return json({ result: data });
    }

    // The student saying "I have read this feedback", which moves the item into
    // the Reviewed section of their dashboard. Their own flag on their own
    // submission - it changes no score and no teacher-visible grading state,
    // and is reversible, so a mis-tap is not destructive.
    if (action === 'markFeedbackReviewed') {
      const { submission_id, reviewed } = body;
      if (!student) return json({ error: 'Please sign in with your school Google account to continue.' }, 401);
      if (!submission_id) return json({ error: 'submission_id is required' }, 400);

      // Ownership is the whole security boundary here: without it any signed-in
      // student could flip this on somebody else's submission.
      const owned = await verifyOwnership(admin, submission_id, body.session_token || '', student);
      if (!owned) return json({ error: 'Not found' }, 404);

      const { data, error } = await admin
        .from('submissions')
        .update({ feedback_reviewed_at: reviewed === false ? null : new Date().toISOString() })
        .eq('id', submission_id)
        .select()
        .single();
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
      // Errors here used to be discarded, so any lookup failure fell through
      // to the insert branch and added a second submitted row for the same
      // student rather than overwriting the first.
      const { data: existing, error: existingErr } = await admin
        .from('submissions')
        .select('id')
        .eq('project_id', project_id)
        .eq('student_user_id', student.id)
        .maybeSingle();
      if (existingErr) return json({ error: existingErr.message }, 500);

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
      if (error) {
        // Lost a race with another request for the same student+project (a
        // slow connection can mean startProject's initial row and a Submit
        // click both try to create it around the same time) - the unique
        // index (migration 0022) is what makes that safe to recover from:
        // fall back to updating the row that won, same as startProject does.
        if ((error as Record<string, any>).code === '23505') {
          const { data: raced, error: racedErr } = await admin
            .from('submissions')
            .update(row)
            .eq('project_id', project_id)
            .eq('student_user_id', student.id)
            .select()
            .single();
          if (!racedErr) return json({ result: raced });
        }
        return json({ error: error.message }, 500);
      }
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
    // Every piece of work in this teacher's courses, in ONE pass, carrying
    // everything any action below needs from it: what kind it is, its title,
    // its course, and whether it is gradeable at all. Memoized for the life of
    // the request - it used to be re-queried several times per request (and
    // the three tables were fetched twice over, once for flags and once for
    // titles), which is most of why opening the grading views took seconds.
    let workIndexCache: Map<string, Record<string, any>> | null = null;
    const myWorkIndex = async () => {
      if (workIndexCache) return workIndexCache;
      const index = new Map<string, Record<string, any>>();
      if (myCourses.length === 0) { workIndexCache = index; return index; }
      const [a, c, p] = await Promise.all([
        admin.from('assignments').select('id, title, course_id, grading_skipped').in('course_id', myCourses),
        admin
          .from('coding_problems')
          .select('id, title, course_id, grading_skipped, grading_kind')
          .in('course_id', myCourses),
        admin.from('projects').select('id, title, course_id, grading_skipped').in('course_id', myCourses),
      ]);
      for (const r of a.data || []) {
        index.set(r.id, { kind: 'frq', title: r.title, course_id: r.course_id, gradable: !r.grading_skipped });
      }
      for (const r of c.data || []) {
        // An autograded Mini Problem is scored the instant it is submitted, so
        // it can never be waiting on a human - not gradeable in this sense
        // however its grading_skipped flag reads.
        const isReview = r.grading_kind === 'review';
        index.set(r.id, {
          kind: isReview ? 'review' : 'code',
          title: r.title,
          course_id: r.course_id,
          gradable: isReview && !r.grading_skipped,
        });
      }
      for (const r of p.data || []) {
        index.set(r.id, { kind: 'project', title: r.title, course_id: r.course_id, gradable: !r.grading_skipped });
      }
      workIndexCache = index;
      return index;
    };

    const myWorkIds = async () => {
      const index = await myWorkIndex();
      const out: { assignments: string[]; coding: string[]; projects: string[] } = {
        assignments: [], coding: [], projects: [],
      };
      for (const [id, meta] of index) {
        if (meta.kind === 'frq') out.assignments.push(id);
        else if (meta.kind === 'project') out.projects.push(id);
        else out.coding.push(id);
      }
      return out;
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

    // Everything a submission LIST needs, and nothing it doesn't. The columns
    // left out here are the ones that carry the bulk: `run_history` (a full
    // code snapshot per Run click, so it grows every time a student presses the
    // button), `files` (whole snapshotted gist contents), `code`, `responses`,
    // `line_comments`, `compile_error`. Measured on this project's real data,
    // those made up roughly two thirds of what a "View Submissions" click
    // downloaded - and none of it is rendered until the teacher opens one
    // specific student, which now fetches that row on its own (getFullOne).
    //
    // The few things the list genuinely shows from those fields are sent as
    // derived scalars instead: whether there is any code at all, how many line
    // comments are attached, the attempt counts, the filenames.
    const summarizeForList = (s: Record<string, any>) => {
      const history = Array.isArray(s.run_history) ? s.run_history : [];
      const firstPassIdx = history.findIndex(
        (h: Record<string, any>) => h.tests_total > 0 && h.tests_passed === h.tests_total
      );
      const files = Array.isArray(s.files) ? s.files : [];
      const lineComments = Array.isArray(s.line_comments) ? s.line_comments : [];
      const {
        run_history: _rh,
        files: _files,
        code,
        responses: _responses,
        line_comments: _lc,
        compile_error,
        session_token: _st,
        ...rest
      } = s;
      return {
        ...rest,
        has_code: !!String(code || '').trim(),
        has_compile_error: !!compile_error,
        line_comment_count: lineComments.length,
        file_names: files.map((f: Record<string, any>) => f?.filename).filter(Boolean),
        run_stats: {
          total_attempts: history.length,
          attempts_to_first_pass: firstPassIdx === -1 ? null : firstPassIdx + 1,
          compile_error_count: history.filter((h: Record<string, any>) => h.compile_error).length,
        },
      };
    };

    if (action === 'listForAssignment') {
      // Ownership by way of the ONE work item being asked about, rather than
      // building the whole index of everything this teacher owns: that meant
      // three table scans (every assignment, problem, and project across all
      // their courses) just to answer "is this one id mine?".
      const table = body.assignment_id
        ? 'assignments'
        : body.coding_problem_id
        ? 'coding_problems'
        : body.project_id
        ? 'projects'
        : null;
      const requested = body.assignment_id || body.coding_problem_id || body.project_id;
      if (!table || !requested) return json({ results: [] });
      const { data: workRow } = await admin
        .from(table)
        .select('course_id')
        .eq('id', requested)
        .maybeSingle();
      if (!workRow || !myCourses.includes(workRow.course_id)) return json({ results: [] });

      const column = body.sort?.column || 'submitted_at';
      const ascending = body.sort?.ascending ?? false;
      let query = admin.from('submissions').select('*').eq('submitted', true);
      if (body.assignment_id) query = query.eq('assignment_id', body.assignment_id);
      if (body.coding_problem_id) query = query.eq('coding_problem_id', body.coding_problem_id);
      if (body.project_id) query = query.eq('project_id', body.project_id);
      const { data, error } = await query.order(column, { ascending });
      if (error) return json({ error: error.message }, 500);
      const rows = data || [];
      // Opt-in so anything still asking for whole rows (the CSV exports, which
      // genuinely need every response) keeps working unchanged.
      return json({ results: body.summary ? rows.map(summarizeForList) : rows });
    }

    // One full submission row, for when the teacher actually opens a student.
    // Deliberately narrower than getForGrading, which also fetches the parent
    // assignment/problem/project - the per-work viewers already hold that, so
    // re-fetching it would be a second query for something they have.
    if (action === 'getFullOne') {
      const { data, error } = await admin
        .from('submissions')
        .select('*')
        .eq('id', body.submission_id)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: 'Not found' }, 404);

      // Ownership off the row we already have, rather than ownsSubmissionId ->
      // myWorkIds, which would scan every piece of work this teacher owns. The
      // teacher clicks through students one at a time while grading, so this is
      // a hot path: two queries total instead of four.
      const table = data.assignment_id
        ? 'assignments'
        : data.coding_problem_id
        ? 'coding_problems'
        : 'projects';
      const workId = data.assignment_id || data.coding_problem_id || data.project_id;
      if (!workId) return json({ error: 'Not found' }, 404);
      const { data: workRow } = await admin
        .from(table)
        .select('course_id')
        .eq('id', workId)
        .maybeSingle();
      if (!workRow || !myCourses.includes(workRow.course_id)) return json({ error: 'Not found' }, 404);

      return json({ result: data });
    }

    if (action === 'listAllSubmitted') {
      // used for the "generate missing access codes" backfill
      const ids = await myWorkIds();
      const { data, error } = await admin.from('submissions').select('*').eq('submitted', true);
      if (error) return json({ error: error.message }, 500);
      return json({ results: (data || []).filter((s: Record<string, any>) => ownsSubmissionRow(s, ids)) });
    }

    // A student who resubmitted more than once before being graded (see
    // reopenMine) leaves several rows behind, all still unscored - they are
    // one person waiting on a grade, not several. Both actions below need to
    // collapse to one row per (work item, student) before counting or
    // listing anything. Keyed on the signed-in user where there is one,
    // falling back to email then name for rows predating sign-in - the same
    // key CodeReviewGrader already groups attempts by.
    // Filtered in Postgres by the work ids this teacher owns. Previously this
    // selected EVERY submitted-and-unscored row in the table and discarded
    // other teachers' in JS, which is both slower and more data over the wire
    // than it needs to be. Chunked because these ids ride in the URL and a
    // whole school's worth would eventually overflow it.
    const unscoredSubmissionsFor = async (
      workIds: string[],
      columns: string,
      excludeSkipped: boolean
    ) => {
      const CHUNK = 100;
      const out: Record<string, any>[] = [];
      for (let i = 0; i < workIds.length; i += CHUNK) {
        const slice = workIds.slice(i, i + CHUNK).join(',');
        let q = admin
          .from('submissions')
          .select(columns)
          .eq('submitted', true)
          .is('score', null)
          .or(
            `assignment_id.in.(${slice}),project_id.in.(${slice}),coding_problem_id.in.(${slice})`
          );
        if (excludeSkipped) q = q.eq('grading_skipped', false);
        const { data, error } = await q.order('submitted_at', { ascending: false });
        if (error) throw new Error(error.message);
        out.push(...(data || []));
      }
      return out;
    };

    const studentKey = (s: Record<string, any>) =>
      s.student_user_id || (s.student_email || '').toLowerCase() || s.student_name || s.id;

    // How much work is sitting there waiting on the teacher. Counted here
    // rather than by shipping every submission to the browser and filtering
    // client-side. `grading_skipped` submissions are excluded, and so is
    // anything belonging to work marked not-graded at all - a teacher who has
    // deliberately decided not to grade something should not keep seeing it
    // nag at them from every badge in the app.
    if (action === 'gradingCounts') {
      const index = await myWorkIndex();
      const gradableIds = [...index.entries()].filter(([, m]) => m.gradable).map(([id]) => id);
      if (gradableIds.length === 0) {
        return json({ result: { byAssignment: {}, byProject: {}, byCodingProblem: {} } });
      }
      const rows = await unscoredSubmissionsFor(gradableIds, 'assignment_id, project_id, coding_problem_id, student_user_id, student_email, student_name', true);

      const byAssignment: Record<string, number> = {};
      const byProject: Record<string, number> = {};
      const byCodingProblem: Record<string, number> = {};
      const seenKeys = new Set<string>();
      for (const row of rows) {
        const workId = row.assignment_id || row.project_id || row.coding_problem_id;
        const meta = index.get(workId);
        if (!meta || !meta.gradable) continue;
        const key = `${workId}::${studentKey(row)}`;
        if (seenKeys.has(key)) continue; // a resubmission from the same student
        seenKeys.add(key);
        const bucket =
          meta.kind === 'frq' ? byAssignment : meta.kind === 'project' ? byProject : byCodingProblem;
        bucket[workId] = (bucket[workId] || 0) + 1;
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
      const index = await myWorkIndex();
      const gradableIds = [...index.entries()].filter(([, m]) => m.gradable).map(([id]) => id);
      if (gradableIds.length === 0) return json({ results: [] });
      const rows = await unscoredSubmissionsFor(
        gradableIds,
        'id, assignment_id, project_id, coding_problem_id, student_name, student_user_id, student_email, submitted_at, grading_skipped',
        false
      );

      // Newest attempt per (work, student); titles come off the index already
      // loaded above rather than three more queries.
      const seenKeys = new Set<string>();
      const results = [];
      for (const s2 of rows) {
        const workId = s2.assignment_id || s2.project_id || s2.coding_problem_id;
        const meta = index.get(workId);
        if (!meta || !meta.gradable) continue;
        const key = `${workId}::${studentKey(s2)}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        results.push({
          id: s2.id,
          kind: meta.kind,
          work_id: workId,
          course_id: meta.course_id,
          title: meta.title,
          student_name: s2.student_name,
          submitted_at: s2.submitted_at,
          grading_skipped: s2.grading_skipped,
        });
      }
      // Oldest-waiting first, which is the order the queue works through.
      results.sort(
        (a, b) => new Date(a.submitted_at ?? 0).getTime() - new Date(b.submitted_at ?? 0).getTime()
      );
      return json({ results });
    }

    // Everything needed to grade ONE submission, whatever kind it is: the full
    // row plus the assignment/problem/project it belongs to. The grading queue
    // walks a list that spans all three types and all courses, so it cannot
    // pre-load the parent work item the way a per-assignment viewer can - it
    // does not know what the next item will be until it gets there. One round
    // trip per item rather than three.
    if (action === 'getForGrading') {
      if (!(await ownsSubmissionId(body.submission_id))) return json({ error: 'Not found' }, 404);
      const { data: sub, error } = await admin
        .from('submissions')
        .select('*')
        .eq('id', body.submission_id)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!sub) return json({ error: 'Not found' }, 404);

      let work = null;
      let kind = null;
      if (sub.assignment_id) {
        kind = 'frq';
        const { data } = await admin.from('assignments').select('*').eq('id', sub.assignment_id).maybeSingle();
        work = data;
      } else if (sub.coding_problem_id) {
        const { data } = await admin.from('coding_problems').select('*').eq('id', sub.coding_problem_id).maybeSingle();
        work = data;
        kind = data?.grading_kind === 'review' ? 'review' : 'code';
      } else if (sub.project_id) {
        kind = 'project';
        const { data } = await admin.from('projects').select('*').eq('id', sub.project_id).maybeSingle();
        work = data;
      }
      if (!work) return json({ error: 'Not found' }, 404);
      return json({ result: { submission: sub, work, kind } });
    }

    if (action === 'saveGrade') {
      if (!(await ownsSubmissionId(body.submission_id))) return json({ error: 'Not found' }, 404);

      // Every existing grader (ByQuestionGrader, SubmissionViewer,
      // CodeReviewGrader, CodingSubmissionViewer, ProjectSubmissionViewer)
      // sends these fields back on every save, whether or not the teacher
      // actually changed anything - clicking Next, or reopening a submission
      // and closing it again, resaves the same values. So "is this field
      // present in the request" cannot stand in for "did this field change";
      // it has to be compared against what is actually stored.
      const { data: before } = await admin
        .from('submissions')
        .select('score, question_scores, part_comments, style_score, style_comments, teacher_comments, line_comments')
        .eq('id', body.submission_id)
        .maybeSingle();

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

      // Changing the grade or the written feedback makes it new to the student
      // again, so it comes back out of the Reviewed shelf on their dashboard
      // and counts as "new feedback" once more. Without this, a student who
      // marked the first pass as read would never be told the mark changed -
      // which the normal FRQ flow hits directly, since grading a few questions
      // now and the rest later is two saves on the same submission.
      // grading_skipped and feedback_released alone are not feedback changes,
      // so they deliberately do not trigger it.
      //
      // Compared against `before`, not against "was this field sent" - see the
      // comment above. JSON.stringify is enough here: these are all either
      // primitives or plain objects/arrays with no key-order sensitivity that
      // would produce a false mismatch.
      const feedbackFields = [
        'score', 'question_scores', 'part_comments', 'style_score', 'style_comments', 'teacher_comments', 'line_comments',
      ] as const;
      const changedFeedback = before
        ? feedbackFields.some(
            (f) => body[f] !== undefined && JSON.stringify(body[f]) !== JSON.stringify(before[f as keyof typeof before])
          )
        : feedbackFields.some((f) => body[f] !== undefined);
      if (changedFeedback) update.feedback_reviewed_at = null;

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
