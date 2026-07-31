# AP CSA Practice Site - Project Context

## What this is
A web app for an AP Computer Science A teacher. Three separate kinds of work:
FRQ (free response) practice with teacher grading, small Java problems that
get autograded, and larger **Projects** turned in as a GitHub Gist link and
reviewed against a rubric with an AI assistant. Originally built on Base44
(a no-code AI app builder); fully migrated off Base44 onto Supabase +
Vercel so the teacher owns the whole stack.

## Stack
- **Frontend**: React + Vite, deployed on Vercel (auto-deploys on every
  `git push` to the GitHub repo's main branch)
- **Backend**: Supabase - Postgres database, Supabase Auth (teachers via
  email/password, students via Google OAuth), Supabase Storage (for uploaded
  images/PDFs), Edge Functions (Deno) for all business logic
- **Code execution**: Piston (whitelisted API, `PISTON_API_KEY` secret) runs
  student Java code for the autograder
- **Gist ingestion**: GitHub Gist API (`GITHUB_TOKEN` secret - optional but
  needed above 60 requests/hr) for Project submissions and starter code

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
- **Student auth**: students sign in with their school Google account
  (Google OAuth via Supabase Auth). The email domain is checked
  **server-side** in `supabase/functions/_shared/studentAuth.ts` - the
  client-side `hd` hint and UI copy are convenience only, not the boundary.
  There is no student allowlist table; the domain check *is* the allowlist.
- **Telling teachers from students**: both are Supabase Auth sessions now, so
  "a session exists" does NOT mean "teacher". `hasActiveTeacherSession()` in
  the shim checks the session's `amr` claim (how *this* session was
  established) rather than the account's `app_metadata.provider`, because one
  account can have both identities linked - e.g. the teacher signing in with
  Google to test the student flow. Don't "simplify" this back to a provider
  check.
- **Submission ownership** (two models coexist): if `submissions.student_user_id`
  is set, the caller's JWT must resolve to that same user. If it's null
  (rows created before sign-in was required, or bulk-imported), it falls back
  to the original random `session_token` check. See `verifyOwnership()` in
  `submissions/index.ts`.
- **Project feedback is release-gated.** `submissions.score` and
  `teacher_comments` are withheld from *every* student-facing read path until
  `submissions.feedback_released` is true - see `withheldIfUnreleased()` in
  `submissions/index.ts`. This must stay server-side: hiding it only in the
  UI still ships the text to the browser, where anyone holding the access
  code could read it out of the network response. Matters because that text
  may be AI-generated and not yet reviewed by a human.
- **Action ordering in Edge Functions is load-bearing.** In
  `submissions/index.ts` and `projects/index.ts`, actions are matched in
  sequence and the teacher gate (`getTeacherFromRequest`) sits partway down
  the file. Any handler placed *above* that gate is publicly reachable with
  just the anon key. When adding an action, put it on the correct side.
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
Teacher dashboard (`/teacher`) has four tabs - FRQ Assignments, Coding
Problems, Projects, Courses - each following the same Form + Card component
pattern under `src/components/teacher/`.

- **FRQ practice**: teacher creates assignments with questions/parts, students
  take them (`/student` -> `/exam`), teacher grades, students check scores by
  access code (`/my-score`)
- **Java autograding**: `coding_problems` table + `run-java-tests` Edge
  Function. A problem tests one or more methods; `/code` picks a problem,
  `/code-practice` is the editor with "Run My Tests" + "Submit Final".
  Per-attempt history (code snapshot, compile errors, per-check results) is
  stored in `submissions.run_history` and drives class-wide insights.
- **Projects**: `projects` table. Students turn in a GitHub Gist URL; the
  server fetches the `.java` files and **snapshots them at submit time**
  (so editing the gist afterward doesn't silently change the submission).
  Teacher gets an **Export for Review** zip containing a generated
  `CLAUDE.md` (rubric + review instructions), `starter/`, and one folder per
  student - designed to be handed to Claude/Cowork. Directions can come from
  a Google Doc (embedded for students, fetched as text into the export).
- **Courses + rosters**: `courses` / `roster_students`. Roster CSV upload
  (`Name,email`). A project pointing at a course shows **who has not turned
  in**, matching on email first and falling back to normalized names.
- **`/my-work`**: signed-in students see all their own graded work, replacing
  the need for the teacher to hand out access codes individually.

## Deliberate design decisions worth not undoing
- **Projects are separate from the autograder on purpose.** Autograder = small
  problems with test cases. Projects = big work reviewed against a rubric by
  an AI assistant, with no automated correctness checking.
- **The app never calls an AI API.** The export/zip flow exists specifically
  so the teacher uses their own Claude for Education seat. There is no
  Anthropic API key in this project, and adding one was considered and
  rejected (cost, and a second vendor relationship for student data).
- **MOSS similarity checking stays a separate local script**, not integrated.
- The teacher login replaced a hardcoded plaintext passcode that used to sit
  in the shipped JS bundle.

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
- **`npx supabase db push` does not work here** - migration `0001_init.sql`
  was applied out-of-band, so push tries to re-run it and fails on
  already-existing tables. Apply new migrations with
  `npx supabase db query --file supabase/migrations/<file>.sql --linked`.
- **`node_modules` is committed to this repo** (~34k tracked files), so
  `git status` is very noisy and every build dirties tracked Vite cache
  files. A `.gitignore` exists but does not untrack already-tracked files.
- Git commit messages with apostrophes break the `git commit -m "$(cat <<'EOF'
  ...)"` heredoc pattern in this environment. Use `git commit -F -` with a
  heredoc instead, or avoid contractions.
- Google OAuth requires the redirect origin to be listed in Supabase
  Authentication -> URL Configuration -> Redirect URLs. A missing entry
  fails *silently*: sign-in completes and bounces back with no session and
  no error.