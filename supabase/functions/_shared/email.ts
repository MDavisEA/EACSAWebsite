// Sends "you have new feedback" emails via Resend (https://resend.com).
// Best-effort, same discipline as the Piston/Gist calls elsewhere in this
// app: a failed or unconfigured send must never break the grade save that
// triggered it - see saveGrade in submissions/index.ts, the only caller.
//
// Requires two secrets, set with `npx supabase secrets set NAME=value`:
//   RESEND_API_KEY  - from the Resend dashboard
//   SITE_URL        - e.g. https://your-site.vercel.app (used in the email body)
// Optional: GRADE_EMAIL_FROM (defaults to Resend's shared test sender, which
// can only deliver to the Resend account's own address until a real sending
// domain is verified in Resend - see the dashboard's Domains tab).
//
// Until RESEND_API_KEY is set, this quietly does nothing (logs why) rather
// than erroring, so the rest of the app works exactly as before setup.
export async function sendGradeNotification(opts: {
  to: string;
  studentName: string;
  title: string;
}): Promise<{ ok: true } | { error: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.log('sendGradeNotification: RESEND_API_KEY not set, skipping');
    return { error: 'not configured' };
  }
  const from = Deno.env.get('GRADE_EMAIL_FROM') || 'AP CSA Practice <onboarding@resend.dev>';
  const siteUrl = Deno.env.get('SITE_URL') || '';
  const firstName = (opts.studentName || '').trim().split(/\s+/)[0] || 'there';

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: `New feedback on ${opts.title}`,
        text: `Hi ${firstName},\n\nYou have new feedback on "${opts.title}" in AP CSA Practice.\n${
          siteUrl ? `\nCheck it out: ${siteUrl}\n` : ''
        }`,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error(`sendGradeNotification: Resend returned ${resp.status}: ${body}`);
      return { error: `Resend error ${resp.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error(`sendGradeNotification threw: ${(e as Error).message}`);
    return { error: (e as Error).message };
  }
}
