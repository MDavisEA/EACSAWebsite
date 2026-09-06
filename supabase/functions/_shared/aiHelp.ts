// Every path that finalizes a Coding Problem or Project submission
// (submissions/index.ts's submitFinal and submitProject, and
// run-java-tests' own final write) requires this same yes/no-plus-link
// disclosure, enforced here rather than only in the UI - a disabled submit
// button is trivially bypassed by calling the action directly.
// `ai_help_used` must be an explicit boolean, and a `true` needs a
// non-blank link. The database has the same constraint (migration 0026)
// as a second line of defense.
export function validateAiHelp(
  body: Record<string, any>
): { error: string } | { ai_help_used: boolean; ai_help_link: string | null } {
  if (typeof body.ai_help_used !== 'boolean') {
    return { error: 'Please say whether you used AI help before submitting.' };
  }
  const link = typeof body.ai_help_link === 'string' ? body.ai_help_link.trim() : '';
  if (body.ai_help_used && !link) {
    return { error: 'Please paste a link to your AI conversation.' };
  }
  return { ai_help_used: body.ai_help_used, ai_help_link: body.ai_help_used ? link : null };
}
