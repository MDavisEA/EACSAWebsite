import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Two Supabase clients get used across these functions:
 *  - `admin` (service_role key) bypasses RLS entirely. This is what actually
 *    reads/writes tables. It never sees the caller's identity on its own.
 *  - the caller's JWT (from the Authorization header, forwarded automatically
 *    by supabase-js on the frontend when the teacher is logged in) is what we
 *    use to figure out WHO is calling, via `getTeacherFromRequest`.
 *
 * A teacher-only action should always look like:
 *   const teacher = await getTeacherFromRequest(req, admin);
 *   if (!teacher) return json({ error: 'Unauthorized' }, 401);
 */

export function createAdminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, serviceRoleKey);
}

export async function getTeacherFromRequest(
  req: Request,
  admin: SupabaseClient
): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  // Verify the JWT is real and get the underlying user - using the admin
  // client's auth.getUser(jwt) checks the token's signature against this
  // project, it does NOT require the anon key to also be passed.
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;

  // Allowlist check: being a valid logged-in Supabase user is not enough on
  // its own. They must also have a row in teacher_profiles.
  const { data: profile } = await admin
    .from('teacher_profiles')
    .select('id, email')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile) return null;
  return { id: profile.id, email: profile.email };
}
