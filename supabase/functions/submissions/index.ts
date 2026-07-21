import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest } from '../_shared/teacherAuth.ts';

function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 - avoids ambiguity
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Verifies the caller actually holds the secret for this submission before
// allowing any read/write of it. This is the fix for the old app's behavior,
// where anyone who knew (or guessed) a student's name could pull up and edit
// their in-progress work.
async function verifyOwnership(admin: any, submissionId: string, sessionToken: string) {
  const { data, error } = await admin
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.session_token !== sessionToken) return null;
  return data;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = createAdminClient();
    const body = await req.json();
    const { action } = body;

    // ============ Student-facing actions (no login, token-gated) ============

    if (action === 'startFresh') {
      const { assignment_id, coding_problem_id, student_name, initial_responses } = body;
      if (!student_name || (!assignment_id && !coding_problem_id)) {
        return json({ error: 'student_name and one of assignment_id/coding_problem_id are required' }, 400);
      }
      const { data, error } = await admin
        .from('submissions')
        .insert({
          assignment_id: assignment_id || null,
          coding_problem_id: coding_problem_id || null,
          student_name,
          responses: initial_responses || {},
          submitted: false,
          access_code: generateAccessCode(),
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data }); // includes id + session_token - client caches both
    }

    if (action === 'resume') {
      const sub = await verifyOwnership(admin, body.submission_id, body.session_token);
      if (!sub) return json({ result: null }); // client falls back to startFresh
      if (sub.submitted) return json({ result: null }); // can't "resume" a finished submission
      return json({ result: sub });
    }

    if (action === 'saveResponses') {
      const sub = await verifyOwnership(admin, body.submission_id, body.session_token);
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
      const sub = await verifyOwnership(admin, body.submission_id, body.session_token);
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
      const { coding_problem_id, student_name } = body;
      if (!coding_problem_id || !student_name) {
        return json({ error: 'coding_problem_id and student_name are required' }, 400);
      }
      const { data, error } = await admin
        .from('submissions')
        .insert({
          coding_problem_id,
          student_name,
          submitted: false,
          access_code: generateAccessCode(),
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    // ============ Public score lookup (access code = shared secret, same
    // model the old app used - unchanged) ============

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
