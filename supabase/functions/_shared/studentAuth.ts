import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Students sign in with their school Google account instead of creating a
 * password-based account. There's no student_profiles allowlist table (unlike
 * teacher_profiles) - the domain check below IS the allowlist, since we're
 * not maintaining a manual roster. Enforced here, server-side, so a client-
 * side domain check being bypassed can never let a non-school account create
 * or touch a submission.
 */
const ALLOWED_STUDENT_DOMAIN = 'episcopalacademy.org';

export async function getStudentFromRequest(
  req: Request,
  admin: SupabaseClient
): Promise<{ id: string; email: string; name: string } | null> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;

  const email = data.user.email || '';
  if (!email.toLowerCase().endsWith(`@${ALLOWED_STUDENT_DOMAIN}`)) return null;

  const name = data.user.user_metadata?.full_name || data.user.user_metadata?.name || email;
  return { id: data.user.id, email, name };
}
