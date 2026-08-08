import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest } from '../_shared/teacherAuth.ts';
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
  return { ...row, score: null, teacher_comments: null };
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
      const { data, error } = await admin
        .from('submissions')
        .update({ responses: body.responses })
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
      const { data, error } = await admin
        .from('submissions')
        .update({
          responses: body.responses,
          submitted: true,
          submitted_at: new Date().toISOString(),
          time_spent_seconds: body.time_spent_seconds ?? null,
        })
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

    if (action === 'listForAssignment') {
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
      const { data, error } = await admin.from('submissions').select('*').eq('submitted', true);
      if (error) return json({ error: error.message }, 500);
      return json({ results: data || [] });
    }

    // How much work is sitting there waiting on the teacher. Counted here
    // rather than by shipping every submission to the browser and filtering
    // client-side. Coding problems are deliberately absent: they are graded
    // automatically, so they can never be waiting on a human.
    if (action === 'gradingCounts') {
      const { data, error } = await admin
        .from('submissions')
        .select('assignment_id, project_id, score')
        .eq('submitted', true)
        .is('score', null);
      if (error) return json({ error: error.message }, 500);

      const byAssignment: Record<string, number> = {};
      const byProject: Record<string, number> = {};
      for (const row of data || []) {
        if (row.assignment_id) byAssignment[row.assignment_id] = (byAssignment[row.assignment_id] || 0) + 1;
        else if (row.project_id) byProject[row.project_id] = (byProject[row.project_id] || 0) + 1;
      }
      return json({ result: { byAssignment, byProject } });
    }

    if (action === 'saveGrade') {
      const update: Record<string, unknown> = {};
      if (body.score !== undefined) update.score = body.score;
      if (body.question_scores !== undefined) update.question_scores = body.question_scores;
      if (body.part_comments !== undefined) update.part_comments = body.part_comments;
      if (body.style_score !== undefined) update.style_score = body.style_score;
      if (body.style_comments !== undefined) update.style_comments = body.style_comments;
      if (body.teacher_comments !== undefined) update.teacher_comments = body.teacher_comments;
      if (body.feedback_released !== undefined) update.feedback_released = body.feedback_released;
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
