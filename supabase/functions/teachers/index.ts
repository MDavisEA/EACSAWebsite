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

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
