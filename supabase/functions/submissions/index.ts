import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest } from '../_shared/teacherAuth.ts';
import { getStudentFromRequest } from '../_shared/studentAuth.ts';
import { extractGistId, fetchGistJavaFiles } from '../_shared/gist.ts';

function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 - avoids ambiguity
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
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
      const { data, error } = await admin
        .from('submissions')
        .insert({
          assignment_id: assignment_id || null,
          coding_problem_id: coding_problem_id || null,
          student_name: student.name,
          student_user_id: student.id,
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
      const { data, error } = await query.maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
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
      return json({ result: data });
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
      return json({ results: data || [] });
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
      const { data, error } = await admin
        .from('submissions')
        .insert({
          coding_problem_id,
          student_name: student.name,
          student_user_id: student.id,
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
        gist_url,
        files: fetched.files,
        gist_captured_at: new Date().toISOString(),
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
      return json({ results: data ? [data] : [] });
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

    if (action === 'saveGrade') {
      const update: Record<string, unknown> = {};
      if (body.score !== undefined) update.score = body.score;
      if (body.question_scores !== undefined) update.question_scores = body.question_scores;
      if (body.part_comments !== undefined) update.part_comments = body.part_comments;
      if (body.style_score !== undefined) update.style_score = body.style_score;
      if (body.style_comments !== undefined) update.style_comments = body.style_comments;
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

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
