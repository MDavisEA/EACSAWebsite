// The school's Google Workspace domain, in one place on the client.
//
// Lives in its own module (rather than in useGoogleSession.js) so the API
// layer can import it without pulling a React hook - and therefore React -
// into base44Client.js.
//
// NOTE: supabase/functions/_shared/studentAuth.ts has its own copy, because
// Edge Functions run in Deno and cannot import from src/. That server-side
// copy is the one that actually enforces the restriction; this one only
// drives UI text and the Google account-picker hint. If the domain ever
// changes, both must be updated.
export const ALLOWED_STUDENT_DOMAIN = 'episcopalacademy.org';
