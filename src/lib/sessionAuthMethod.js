// Distinguishes how a Supabase session was established (password vs Google
// OAuth) by reading the `amr` (Authentication Method Reference) claim off the
// access token's own JWT payload, instead of the account-level
// user.app_metadata.provider.
//
// That distinction matters once a single account has more than one linked
// identity - e.g. the teacher's own email/password account also signing in
// with Google to test the student flow. Supabase links identities by email,
// so that account's app_metadata.provider stays whatever method the account
// was FIRST created with, even after a Google sign-in succeeds. amr, by
// contrast, is scoped to the session/token itself (how THIS session was
// established), so it stays correct regardless of what else is linked to
// the underlying account.
export function getSessionAuthMethod(session) {
  const token = session?.access_token;
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const amr = JSON.parse(json)?.amr || [];
    if (amr.some((a) => a.method === 'oauth')) return 'oauth';
    if (amr.some((a) => a.method === 'password')) return 'password';
    return null;
  } catch {
    return null;
  }
}
