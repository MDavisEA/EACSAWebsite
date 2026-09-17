// Sends "you have new feedback" emails through the Gmail API, authenticated
// as one fixed Google account via a long-lived OAuth refresh token - not a
// third-party email vendor, since Google is already the trust boundary this
// whole app runs on for sign-in. Best-effort, same discipline as the
// Piston/Gist calls elsewhere in this app: a failed or unconfigured send
// must never break the grade save that triggered it - see saveGrade in
// submissions/index.ts, the only caller.
//
// Requires four secrets, set with `npx supabase secrets set NAME=value`:
//   GMAIL_CLIENT_ID      - OAuth client id from Google Cloud Console
//   GMAIL_CLIENT_SECRET  - that client's secret
//   GMAIL_REFRESH_TOKEN  - obtained once via a manual OAuth consent (see
//                          CLAUDE.md for the exact steps) for the Gmail
//                          account that should send these
//   GMAIL_SENDER         - that same account's email address (Gmail's API
//                          only lets you send "From" the authenticated
//                          account itself, not an arbitrary address)
// Plus SITE_URL (e.g. https://your-site.vercel.app, used in the email body).
//
// Until all of these are set, this quietly does nothing (logs why) rather
// than erroring, so the rest of the app works exactly as before setup.

async function getAccessToken(): Promise<string | null> {
  const clientId = Deno.env.get('GMAIL_CLIENT_ID');
  const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!resp.ok) {
      console.error(`getAccessToken: refresh failed ${resp.status}: ${await resp.text().catch(() => '')}`);
      return null;
    }
    const data = await resp.json();
    return data.access_token ?? null;
  } catch (e) {
    console.error(`getAccessToken threw: ${(e as Error).message}`);
    return null;
  }
}

// Gmail's API wants the raw RFC 2822 message, base64url-encoded (standard
// base64 with +/ swapped for -_ and no padding) - not the same as a plain
// base64 attachment encoding.
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// The one thing that actually talks to Gmail - both notification types below
// are just different subject/body text wrapped around this.
async function sendEmail(opts: { to: string; subject: string; text: string }): Promise<{ ok: true } | { error: string }> {
  const sender = Deno.env.get('GMAIL_SENDER');
  if (!sender) {
    console.log('sendEmail: GMAIL_SENDER not set, skipping');
    return { error: 'not configured' };
  }
  const accessToken = await getAccessToken();
  if (!accessToken) return { error: 'not configured' };

  const message =
    `From: AP CSA Practice <${sender}>\r\n` +
    `To: ${opts.to}\r\n` +
    `Subject: ${opts.subject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/plain; charset="UTF-8"\r\n\r\n` +
    opts.text;
  const raw = base64UrlEncode(new TextEncoder().encode(message));

  try {
    const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      console.error(`sendEmail: Gmail API returned ${resp.status}: ${errBody}`);
      return { error: `Gmail API error ${resp.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error(`sendEmail threw: ${(e as Error).message}`);
    return { error: (e as Error).message };
  }
}

export async function sendGradeNotification(opts: {
  to: string;
  studentName: string;
  title: string;
}): Promise<{ ok: true } | { error: string }> {
  const siteUrl = Deno.env.get('SITE_URL') || '';
  const firstName = (opts.studentName || '').trim().split(/\s+/)[0] || 'there';
  return sendEmail({
    to: opts.to,
    subject: `New feedback on ${opts.title}`,
    text: `Hi ${firstName},\n\nYou have new feedback on "${opts.title}" in AP CSA Practice.\n${
      siteUrl ? `\nCheck it out: ${siteUrl}\n` : ''
    }`,
  });
}

// Used in both directions - a student replying emails the teacher, and a
// teacher replying emails the student back. `greetingName` is whoever is
// receiving this email; `fromLabel` names whoever just wrote the reply.
export async function sendReplyNotification(opts: {
  to: string;
  greetingName: string;
  fromLabel: string;
  title: string;
  preview: string;
}): Promise<{ ok: true } | { error: string }> {
  const siteUrl = Deno.env.get('SITE_URL') || '';
  const firstName = (opts.greetingName || '').trim().split(/\s+/)[0] || 'there';
  const snippet = opts.preview.length > 300 ? `${opts.preview.slice(0, 300)}…` : opts.preview;
  return sendEmail({
    to: opts.to,
    subject: `New reply on ${opts.title}`,
    text: `Hi ${firstName},\n\n${opts.fromLabel} replied on "${opts.title}" in AP CSA Practice:\n\n"${snippet}"\n${
      siteUrl ? `\nView and reply: ${siteUrl}\n` : ''
    }`,
  });
}
