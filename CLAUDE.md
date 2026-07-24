# AP CSA Practice Site - Project Context

## What this is
A web app for an AP Computer Science A teacher: students practice AP-style
FRQ (free response) questions and get instant feedback, and separately can
write real Java code that gets autograded. Originally built on Base44
(a no-code AI app builder); fully migrated off Base44 onto Supabase +
Vercel so the teacher owns the whole stack.

## Stack
- **Frontend**: React + Vite, deployed on Vercel (auto-deploys on every
  `git push` to the GitHub repo's main branch)
- **Backend**: Supabase - Postgres database, Supabase Auth (teacher login
  only - students never create accounts), Supabase Storage (for uploaded
  images/PDFs), Edge Functions (Deno) for all business logic
- **Code execution**: Piston (free public API) runs student Java code for
  the autograder

## The most important architectural fact: the shim
`src/api/base44Client.js` is a compatibility layer. Every existing page
(`ExamPage.jsx`, `TeacherDashboard.jsx`, `MyScore.jsx`, etc.) still calls
`base44.entities.Assignment.filter(...)`, `base44.auth.me()`, etc. - the
exact same calls they made when this was a real Base44 app. That file is
the ONLY place that knows Base44 is gone; it translates those calls into
Supabase Edge Function invocations underneath. This is why most of the
original app's pages never needed to be rewritten. Any new feature should
either extend this shim's existing namespaces (`entities`, `auth`,
`integrations`, `functions`) or add a clearly-scoped new namespace (see how
`coding` was added, for the autograder) - don't bypass it and call Supabase
directly from page components.

## Security model (don't accidentally weaken this)
- **Teacher auth**: real Supabase Auth login. A user must ALSO have a row
  in the `teacher_profiles` table to be treated as a teacher - just having
  a valid login isn't enough (defense in depth). Checked server-side in
  `supabase/functions/_shared/teacherAuth.ts`.
- **Student submissions**: students never log in. Each submission gets a
  random `session_token` on creation, cached in the browser's
  `localStorage`. Every read/write to that submission requires the token.
  This replaced the original (Base44-era) behavior where any submission
  could be found and edited just by knowing/guessing a student's name -
  that was a real vulnerability, fixed deliberately. Trade-off: resuming
  an in-progress submission only works on the same browser/device that
  started it, since the token lives in localStorage.
- **All Postgres tables have RLS enabled with NO client-facing policies.**
  Nothing is readable/writable directly from the browser via the anon key.
  Every single read and write goes through an Edge Function using the
  service_role key, which enforces the real authorization logic itself.
  This is a deliberate, consistent pattern - don't add a table with an RLS
  policy that lets the browser talk to it directly; add another Edge
  Function action instead, following the existing pattern in
  `supabase/functions/*/index.ts`.
- **Hidden test cases**: a coding problem can test multiple methods
  (`coding_problems.methods`, an array - each entry has its own
  `harness_type`/`method_name`/`test_cases`). Any test case within a
  method's `test_cases` can be marked `hidden: true`. Students must never
  receive the expected output or method args for hidden tests - only
  pass/fail. This is enforced in `coding-problems/index.ts`'s
  `sanitizeForStudent()` and in `run-java-tests/index.ts`'s response
  mapping. Be careful not to leak this if touching either file.

## What exists and is deployed and working
- FRQ practice: teacher creates assignments with questions/parts, students
  take them (`/student` -> `/exam`), teacher grades (`/teacher`), students
  check scores by access code (`/my-score`)
- Java autograding: `coding_problems` table + `run-java-tests` Edge
  Function, tested against a real seeded problem (Password Generator).
  Student-facing pages exist: `/code` (pick a problem) and `/code-practice`
  (editor + "Run My Tests" self-check + "Submit Final")
- Two intentional fixes over the original Base44 app: the teacher login
  (was a hardcoded plaintext passcode in the JS bundle - now real auth) and
  the submission ownership model described above

## What's NOT built yet
- **No teacher-facing UI for creating/editing coding problems.** Right now
  the only coding problem in the database was inserted via a raw SQL seed
  file (`supabase/seed_password_generator.sql`). Building a form-based
  editor for this (probably modeled on the existing `AssignmentForm.jsx`/
  `QuestionEditor.jsx` pattern) is the natural next task.

## Known environment quirks on this machine
- This is a school-managed Mac running Jamf; some background security
  tooling silently blocked esbuild's local process communication once
  before - if `npm run dev` hangs with no error, that's the likely cause
  again, not a code problem. Node is pinned via `nvm` to v22 (the very
  newest Node versions have had issues with this project's Vite/esbuild
  versions).
- Deploys are: any Supabase change (new/changed Edge Function, new SQL
  migration) needs `npx supabase functions deploy <name>` run manually;
  any frontend-only change just needs `git push` and Vercel deploys
  automatically. Most day-to-day feature work is frontend-only.