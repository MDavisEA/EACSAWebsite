# Migrating off Base44: Setup Guide

This replaces Base44 entirely with Supabase (Postgres + Auth + Storage + Edge
Functions) and Vercel/Netlify (static hosting for the React frontend). Same
app, same features, one new capability (Java autograding), and two real
security fixes along the way.

## What actually changed

**Nothing changed in almost any page or component.** The trick that made this
tractable: every page already talked to Base44 through one file
(`src/api/base44Client.js`) using a consistent shape -
`base44.entities.X.create/filter/update/delete`, `base44.auth.me()`,
`base44.integrations.Core.UploadFile()`. That file has been rewritten to
implement the exact same shape, backed by Supabase Edge Functions instead of
Base44. Every page that imports `base44` and calls those methods works
unchanged.

The files that DID change, and why:

| File | Why |
|---|---|
| `src/api/base44Client.js` | Rewritten - now calls Supabase Edge Functions instead of Base44 |
| `src/api/supabaseClient.js` | New - raw Supabase client init |
| `src/lib/AuthContext.jsx` | Rewritten - was directly importing `@base44/sdk` internals, tracked Base44's own hosted app-auth state. Now tracks a real Supabase Auth session instead. |
| `src/pages/Landing.jsx` | **Security fix** - see below |
| `src/pages/TeacherDashboard.jsx` | **Security fix** - see below |
| `vite.config.js` | Rewritten - the removed `@base44/vite-plugin` was silently providing the `@/` path alias used in every import across the app. That's now an explicit `resolve.alias` instead of hidden inside a platform plugin. |
| `package.json` | `@base44/sdk` and `@base44/vite-plugin` removed, `@supabase/supabase-js` added |
| `index.html` | Base44 branding removed |

Everything else - every page, every component, all your actual UI and
grading logic - is untouched.

## The two security fixes (do these regardless of the rest of this migration)

**1. The old teacher "passcode" was hardcoded in plaintext in the shipped
JavaScript.** `Landing.jsx` had `const TEACHER_PASSCODE = "apcsa2024"` sitting
directly in client-side source - anyone could read it from browser dev tools,
or just skip it entirely by running `sessionStorage.setItem("teacher_auth",
"true")` in the console. This is now a real login against Supabase Auth
(`Landing.jsx` has an email/password form; `TeacherDashboard.jsx` checks a
real server-issued session instead of a sessionStorage flag).

**2. Students could edit each other's in-progress work.** The old app found a
student's in-progress submission by matching `assignment_id` + `student_name`
- no secret involved, so anyone who knew (or guessed) a classmate's name
could pull up and edit their draft. Every submission now gets a random
`session_token` on creation, cached in the creating browser's `localStorage`,
and required for every subsequent read/write. See "Trade-off" below for the
one thing this changes about resuming an exam.

## Setup steps

### 1. Create a Supabase project
Go to [supabase.com](https://supabase.com), create a free account and a new
project. Save the database password somewhere - you likely won't need it
directly, but the dashboard will ask you to set one.

### 2. Run the database migration
In the Supabase dashboard: **SQL Editor > New Query**, paste the entire
contents of `supabase/migrations/0001_init.sql`, and run it. This creates all
four tables (`assignments`, `submissions`, `coding_problems`,
`teacher_profiles`) with RLS locked down by default.

I ran this exact file against a real Postgres instance while building it (not
just Supabase specifically) to confirm it executes cleanly and that the
constraints/triggers behave as intended, so this step should be uneventful.

### 3. (Optional) Seed the Password Generator demo problem
Same SQL Editor, run `supabase/seed_password_generator.sql`. This gives you
one real coding problem to test the autograder against once you build the
student-facing page for it (see "What's not built yet" below).

### 4. Create a Storage bucket
**Storage > New Bucket**, name it exactly `uploads`, and mark it **Public**.
This holds reference-sheet images and answer-key screenshots - the same
purpose Base44's `UploadFile` served.

### 5. Deploy the Edge Functions
Install the Supabase CLI if you don't have it, then from this project's root:

```bash
supabase login
supabase link --project-ref your-project-ref   # find this in your dashboard URL
supabase functions deploy assignments
supabase functions deploy submissions
supabase functions deploy coding-problems
supabase functions deploy run-java-tests
supabase functions deploy upload-file
supabase functions deploy extract-pdf-text
```

No manual secrets needed here - `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are automatically available inside every Edge
Function at runtime, you don't set them yourself.

### 6. Create your teacher account
**Authentication > Users > Add User** in the dashboard - enter your email and
a password, and toggle "Auto Confirm User" on. Then back in **SQL Editor**,
link that account as an actual teacher (replace the email):

```sql
insert into teacher_profiles (id, email, display_name)
select id, email, 'Your Name'
from auth.users
where email = 'you@yourschool.edu';
```

This second step matters - without a row in `teacher_profiles`, that login
would authenticate fine but every teacher-only action would still reject it.

### 7. Turn off public sign-ups
**Authentication > Providers > Email**, turn off "Allow new users to sign
up." Nobody but you should ever be creating accounts here - students never
log in at all, they use the name/access-code flow exactly like before.

### 8. Configure and run the frontend
```bash
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from
# Settings > API in your Supabase dashboard
npm install
npm run dev      # test locally first
npm run build    # then build for real
```

### 9. Deploy the frontend
Push this to a GitHub repo and connect it to Vercel or Netlify (both free for
this scale) - or run `vercel` / `netlify deploy` directly from the CLI if you
have one installed. Either way, set the same two environment variables
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in the hosting provider's
dashboard, not just locally.

## Testing checklist before you trust this with real classes

- [ ] Log in at `/` as teacher, land on `/teacher`, create a test assignment
- [ ] Open `/student`, start that assignment as a fake student, answer a
      question, close the tab, reopen `/student?id=...`, re-enter the same
      name - confirm your answer is still there (resume flow)
- [ ] Submit the assignment, confirm you land on `/submitted`
- [ ] Back in `/teacher`, open the assignment, confirm the submission shows
      up and you can grade it
- [ ] Generate an access code, use it on `/my-score`, confirm the score and
      (if you turned it on for that assignment) the answer key show up
- [ ] Try editing someone else's submission by guessing their name in a
      second browser/incognito window with no cached token - confirm it
      does NOT let you (this is the fix working)

## The trade-off worth knowing about

Because resuming now requires a token cached in `localStorage`, a student who
starts an assignment, then switches to a **different device or browser**, or
clears their browser storage, before finishing, can't resume the old
in-progress draft by re-typing their name - they'll start a fresh submission
instead, and the old one just sits there abandoned (harmless, but visible to
you as an incomplete attempt in the dashboard). The old app allowed cross-device
resume, but only because anyone with a name and an assignment link could edit
anyone's draft - that's the trade being made. Same-device resume (closing and
reopening the same browser tab, or the whole browser) works exactly like
before, since `localStorage` survives that.

## What's not built yet

The autograder backend (`coding_problems` table, `run-java-tests` function)
is real and tested, but there's no page yet for a student to actually open a
coding problem, write code, and click "run tests" - that's a frontend page
that doesn't exist in this codebase yet, same as where we left off before
this migration. The backend is ready for it whenever you want that page
built.

## On cost

Supabase's free tier (as of mid-2026) covers this comfortably: 500 MB
database, 1 GB file storage, 5 GB bandwidth, 500,000 Edge Function calls, and
50,000 monthly active users - a single class's worth of FRQ practice and
autograding won't come close to most of these. The one limit worth planning
around: **free-tier projects pause automatically after 7 days with no
requests**, which matters for a school calendar - a quiet week (a break,
between units) could leave the site asleep until someone visits the
dashboard and clicks resume. That's a non-issue if you check in periodically,
or it's a $25/month Pro plan away from not being a concern at all. Numbers
shift over time - worth a quick check at supabase.com/pricing before you
commit long-term. Vercel/Netlify's free tiers are similarly generous for a
single class's traffic.

Piston (the code-execution service the autograder calls) remains the free,
public, rate-limited instance - unchanged from before. Same note as last
time: fine for a single class, revisit (self-host) if usage grows.
