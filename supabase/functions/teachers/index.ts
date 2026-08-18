import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest } from '../_shared/teacherAuth.ts';

// Adding a colleague to the site. Any teacher can invite another - this is a
// two-person department, not an org chart - but two guards matter:
//
//  - the caller must already be a teacher, so an invite is never a way in
//  - the address must be on the school domain, so a typo emails a colleague
//    who does not exist rather than a stranger who does
//
// The invited teacher sets their own password through the emailed link. No
// password is ever chosen here, sent here, or stored anywhere in this app.
const ALLOWED_TEACHER_DOMAIN = 'episcopalacademy.org';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = createAdminClient();
    const body = await req.json();
    const { action } = body;

    const teacher = await getTeacherFromRequest(req, admin);
    if (!teacher) return json({ error: 'Unauthorized' }, 401);

    if (action === 'list') {
      const { data, error } = await admin
        .from('teacher_profiles')
        .select('id, email, display_name, created_at')
        .order('created_at', { ascending: true });
      if (error) return json({ error: error.message }, 500);
      return json({
        results: (data || []).map((t: Record<string, any>) => ({ ...t, is_you: t.id === teacher.id })),
      });
    }

    if (action === 'invite') {
      const email = String(body.email || '').trim().toLowerCase();
      const displayName = String(body.display_name || '').trim();

      if (!email.endsWith(`@${ALLOWED_TEACHER_DOMAIN}`)) {
        return json({ error: `Teacher accounts have to be @${ALLOWED_TEACHER_DOMAIN} addresses.` }, 400);
      }

      const { data: already } = await admin
        .from('teacher_profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (already) return json({ error: 'That teacher already has an account.' }, 409);

      // Supabase emails the link; redirectTo has to be listed under
      // Authentication -> URL Configuration or the link silently goes nowhere.
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: body.redirect_to || undefined,
      });

      let userId = invited?.user?.id;
      if (inviteErr) {
        // Already a Supabase user (e.g. they once signed in as a student to
        // test) - that is fine, they just need the teacher row.
        const { data: list } = await admin.auth.admin.listUsers();
        const existing = (list?.users || []).find(
          (u: Record<string, any>) => (u.email || '').toLowerCase() === email
        );
        if (!existing) return json({ error: inviteErr.message }, 500);
        userId = existing.id;
      }
      if (!userId) return json({ error: 'Could not create that account.' }, 500);

      // The teacher_profiles row is the actual allowlist - a Supabase account
      // on its own grants nothing.
      const { error: profileErr } = await admin
        .from('teacher_profiles')
        .insert({ id: userId, email, display_name: displayName || email });
      if (profileErr) return json({ error: profileErr.message }, 500);

      return json({
        result: {
          email,
          emailed: !inviteErr,
          note: inviteErr
            ? 'That address already had a login, so no email was sent - they can sign in with the password they already use.'
            : null,
        },
      });
    }

    // ---- Comment bank ----
    // Scoped to the teacher rather than to a course: the remarks worth saving
    // ("check your loop bounds") are about how a teacher writes feedback, not
    // about which class the student is in.
    //
    // Within that, each comment is scoped to the one piece of work it was
    // saved from (see 0015_scope_comment_bank.sql) unless it is "global" - all
    // three of assignment_id/coding_problem_id/project_id null - in which case
    // it belongs everywhere. A grading surface asks for its own comments by
    // passing the one id it has (e.g. coding_problem_id); it always gets the
    // global set back too, unioned in.

    // Picks the single scope column a caller is asking about, if any. Only one
    // is ever relevant per request - a Coding Assignment grader has no reason
    // to also pass an assignment_id.
    function scopeFromBody(b: Record<string, any>): { col: string; id: string } | null {
      if (b.assignment_id) return { col: 'assignment_id', id: b.assignment_id };
      if (b.coding_problem_id) return { col: 'coding_problem_id', id: b.coding_problem_id };
      if (b.project_id) return { col: 'project_id', id: b.project_id };
      return null;
    }

    if (action === 'listComments') {
      const scope = scopeFromBody(body);
      let query = admin.from('comment_bank').select('*').eq('teacher_id', teacher.id);
      query = scope
        ? // The global set (all three columns null) OR an exact match on the
          // one scope column asked for.
          query.or(
            `and(assignment_id.is.null,coding_problem_id.is.null,project_id.is.null),${scope.col}.eq.${scope.id}`
          )
        : // No scope given - the global set only. This is also what the
          // teacher-page "Frequently Used Comments" manager asks for.
          query.is('assignment_id', null).is('coding_problem_id', null).is('project_id', null);
      const { data, error } = await query
        // Most-reached-for first, so the useful ones stay at the top instead
        // of the teacher scanning an alphabetical list every time.
        .order('use_count', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ results: data || [] });
    }

    if (action === 'createComment') {
      const bodyText = String(body.body || '').trim();
      if (!bodyText) return json({ error: 'A saved comment needs some text.' }, 400);
      const scope = scopeFromBody(body);
      const scopeRow = {
        assignment_id: scope?.col === 'assignment_id' ? scope.id : null,
        coding_problem_id: scope?.col === 'coding_problem_id' ? scope.id : null,
        project_id: scope?.col === 'project_id' ? scope.id : null,
      };

      // Saving the same remark twice in the same scope is a slip, not an
      // intent - hand back the existing one so the bank does not fill up with
      // duplicates. Matched WITHIN the scope: the same words saved once for
      // this assignment and once as a global comment are two different
      // decisions, not a duplicate of each other.
      let dupeQuery = admin
        .from('comment_bank')
        .select('*')
        .eq('teacher_id', teacher.id)
        .eq('body', bodyText);
      for (const [col, val] of Object.entries(scopeRow)) {
        dupeQuery = val ? dupeQuery.eq(col, val) : dupeQuery.is(col, null);
      }
      const { data: dupe } = await dupeQuery.maybeSingle();
      if (dupe) return json({ result: dupe, already_existed: true });

      const { data, error } = await admin
        .from('comment_bank')
        .insert({ teacher_id: teacher.id, body: bodyText, ...scopeRow })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'updateComment') {
      const { data: row } = await admin
        .from('comment_bank')
        .select('id')
        .eq('id', body.id)
        .eq('teacher_id', teacher.id)
        .maybeSingle();
      if (!row) return json({ error: 'Not found' }, 404);
      const { data, error } = await admin
        .from('comment_bank')
        .update({ body: String(body.body || '').trim() })
        .eq('id', body.id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'deleteComment') {
      const { error } = await admin
        .from('comment_bank')
        .delete()
        .eq('id', body.id)
        .eq('teacher_id', teacher.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // Bumped when a comment is actually inserted into feedback, which is what
    // makes the ordering above reflect real use.
    if (action === 'usedComment') {
      const { data: row } = await admin
        .from('comment_bank')
        .select('use_count')
        .eq('id', body.id)
        .eq('teacher_id', teacher.id)
        .maybeSingle();
      if (!row) return json({ error: 'Not found' }, 404);
      const { error } = await admin
        .from('comment_bank')
        .update({ use_count: (row.use_count || 0) + 1 })
        .eq('id', body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
