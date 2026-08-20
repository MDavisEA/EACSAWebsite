import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { getSessionAuthMethod } from '@/lib/sessionAuthMethod';

import { ALLOWED_STUDENT_DOMAIN } from '@/lib/schoolConfig';

// Re-exported so pages that already import this hook can get the domain from
// the same place, without a second import line.
export { ALLOWED_STUDENT_DOMAIN };

// Tracks the student's Google-signed-in session. Kept separate from
// AuthContext.jsx (which is shaped around the teacher email/password login
// and, per its own comment, isn't wired into routing) rather than overloading
// that context with a second, unrelated meaning.
//
// Domain rejection lives here, once, rather than being repeated in every
// page that uses this hook: if a signed-in Google account isn't on the
// school domain, sign it out immediately and surface `domainRejected` so the
// page can show a message. This is a client-side courtesy only - the real
// enforcement is server-side, in every Edge Function via
// getStudentFromRequest, which a bypassed client check can't get around.
export function useGoogleSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [domainRejected, setDomainRejected] = useState(false);

  useEffect(() => {
    const applySession = (newSession) => {
      const isGoogleSession = getSessionAuthMethod(newSession) === 'oauth';
      if (!isGoogleSession) {
        setSession(null);
        return;
      }
      const email = newSession.user.email || '';
      if (!email.toLowerCase().endsWith(`@${ALLOWED_STUDENT_DOMAIN}`)) {
        supabase.auth.signOut();
        setSession(null);
        setDomainRejected(true);
        return;
      }
      setDomainRejected(false);
      // Keep the SAME object when it is the same signed-in user. supabase-js
      // re-checks the session whenever the tab regains focus and emits an
      // auth event (TOKEN_REFRESHED) with a freshly built session object -
      // so handing that straight to setSession changed the object's identity
      // on every window switch. Pages key effects on `session`, so each
      // switch away and back re-ran them: the dashboard refetched and flashed
      // its spinner, and ProjectPage re-issued startProject, a write.
      //
      // Safe to hold a stale object because nothing reads a token off it -
      // authHeader() always calls supabase.auth.getSession() for the current
      // one, so requests still use a refreshed token even though this
      // reference does not change.
      setSession((prev) =>
        prev && newSession && prev.user?.id === newSession.user?.id ? prev : newSession
      );
    };

    supabase.auth.getSession().then(({ data }) => {
      applySession(data?.session ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      applySession(newSession);
    });

    return () => listener?.subscription?.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, loading, domainRejected };
}
