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
- **Grade notification emails**: sent through the Gmail API, authenticated as
  one Google account via a long-lived OAuth refresh token - not a
  third-party vendor, since Google is already this app's trust boundary for
  sign-in. Secrets: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
  `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER` (the account's own address - Gmail's
  API only lets you send "From" the authenticated account itself), plus
  `SITE_URL`. See `supabase/functions/_shared/email.ts`. Until all four
  Gmail secrets are set this quietly no-ops (logs and moves on); nothing
  else about grading breaks.
  - **Getting a refresh token** (one-time, manual - Google doesn't hand
    these out any other way): in Google Cloud Console, under the same
    project (create one under the school's Google Workspace account if
    starting fresh - see below for why that matters), enable the Gmail API,
    set the OAuth consent screen's **User Type to Internal** (only offered
    for a Workspace-owned project - this matters because an External app's
    refresh tokens expire after 7 days unless Google reviews/verifies it,
    while Internal apps have neither restriction), add the
    `https://www.googleapis.com/auth/gmail.send` scope, then create an OAuth
    **Web application** client with `https://developers.google.com/oauthplayground`
    as an authorized redirect URI. Then use
    [Google's OAuth Playground](https://developers.google.com/oauthplayground):
    gear icon → "Use your own OAuth credentials" → paste the client
    id/secret → pick the Gmail API `.../auth/gmail.send` scope → Authorize
    APIs (sign in as whichever account should send) → Exchange authorization
    code for tokens. The refresh token shown there is `GMAIL_REFRESH_TOKEN`;
    the account signed into is `GMAIL_SENDER`.

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
- **Sketch files are private.** The `sketch-assets` Storage bucket is not
  public; nothing is ever served by a permanent URL. Every list/upload/remove
  goes through the `sketch-assets` function, which derives authorization from
  the submission (owning student, or the teacher who owns the project's
  course) and generates storage paths itself - never from the request.
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
- **Loop Practice**: a DeltaMath-style drill tool for for-loops, separate
  from the autograder. `loop_problems` is a teacher-curated bank of two item
  types - trace-the-output and "which loop produces this output" multiple
  choice - authored by hand or bulk-imported from AI-generated JSON.
  `loop_assignments` assembles filtered slices of the bank into practice
  sets with a `target_score`, a per-wrong-answer `wrong_penalty`, and a
  `partial_credit` rate. Multiple choice gets a free second try: a first
  wrong guess (no `second_try_of` in the `submitLoopAnswer` request) scores
  nothing and reveals nothing - not even that it was "try 1 of 2" - and lets
  them pick again from all four options. Only the SECOND submission for that
  instance (which carries `second_try_of`, the first guess's choice_index)
  actually writes anything: `partial_credit` instead of full credit if
  they're right the second time, the normal `wrong_penalty` once (not
  doubled) if they're wrong both times. Unlike every other work table,
  ownership is a direct `teacher_id` column rather than derived through
  `course_id`, because a practice set can be standalone (not filed under any
  class) as well as course/unit-scoped. Grading happens
  server-side in `submissions/index.ts`'s `submitLoopAnswer` - the client
  never sees a trace item's `expected_output` or which multiple-choice
  option is correct before answering. Teacher UI lives under its own
  "Loop Practice" top-level tab (`LoopPracticePanel`), and a course-scoped
  practice set also shows up in that course's own Loop Practice tab inside
  `CourseUnitsView`. Each `LoopAssignmentCard` has its own "View
  Submissions" (`LoopSubmissionViewer`) - read-only, unlike every other
  work type's, since there's nothing to grade - showing everyone who has
  STARTED the set, in progress or complete. It's the one caller of
  `listForAssignment` (submissions/index.ts) that does NOT filter on
  `submitted=true`: that column means "turned in" everywhere else, but here
  it means "reached the target score," and a teacher checking progress
  wants to see who's still working too. Students use it at `/loop-practice`. A standalone
  practice set (`course_id` null) needs no student sign-in at all - progress
  is tracked by a server-generated `session_token` cached client-side,
  the same ownership model every submission used before Google sign-in was
  required (see `verifyOwnership` in `submissions/index.ts`); a course-scoped
  one still requires it, like everything else. New bank items and
  assignments also propagate to any colleague linked via Course Links
  (`_shared/courseLinks.ts`'s `linkedTeacherIds`, bridging the course-to-course
  `course_links` table to a teacher-to-teacher relationship since
  `loop_problems` has no `course_id` of its own to key a link off of) - like
  every other kind of propagated work, a copy always lands inactive and only
  on create, never on edit.
- **Grade notification emails**: `saveGrade` (FRQ, Coding Assignment,
  Project) emails the student the first time their score actually becomes
  visible to them - for a Project that means both a score AND
  `feedback_released`, not just the score. `submissions.graded_notified_at`
  is the guard: set the moment an email goes out, checked before ever
  sending another one, so re-saving the same grade (fixing a typo, adding a
  late comment) never re-notifies. Cleared back to null only by `reopenMine`
  (a Coding Assignment reopened for another attempt), so a genuinely new
  round of grading notifies again. Autograded Mini Problems never notify -
  the student is already looking at their own result live the moment
  `run-java-tests` returns it.
- **Feedback reply threads**: `submissions.comment_replies` is a back-and-
  forth conversation layered on top of the original `teacher_comments`
  field, which is untouched and still edited the same way it always was -
  this is additive, not a redesign of grading. `addCommentReply` (student,
  in `submissions/index.ts`) only works once feedback is actually visible to
  them (same score/`feedback_released` gate as everywhere else) and emails
  the teacher who owns the course; `addTeacherReply` (teacher) has no such
  gate - a teacher can write to a student on anything - and clears
  `feedback_reviewed_at` so the item resurfaces as needing another look, the
  same way any other feedback change does. Covers FRQ, Coding Assignment,
  and Project only (not autograded Mini Problems, which have no teacher
  comment to reply to in the first place). Student UI is a shared
  `FeedbackThread` component in `SubmissionDetail.jsx` (which also fixed a
  pre-existing gap: FRQ never showed an overall comment there at all before
  this); teacher UI is in `GradingQueue.jsx`, separate from the main
  `saveGrade`/`save()` flow on purpose - a reply isn't a grading action.

- **Processing / AP CSP classes**: `courses.language` is `'java'` (everything above)
  or `'processing'`, chosen once when the class is created (`CourseForm`) and
  never editable (the courses function strips it on update). A Processing
  class holds exactly one kind of work, a **sketch** - which is a Project with
  `projects.kind = 'sketch'`, NOT a fifth work type. Reusing Projects is the
  point: rubric, line comments, release-gated feedback (`feedback_released`),
  reply threads, grade emails, section due dates, the "who has not turned in"
  roster diff and linked courses all work unchanged. `kind` is derived
  server-side from the course's language (`kindForCourse` in
  `projects/index.ts`) and never trusted from the request; a project cannot
  move to a course of the other language, and a Java course cannot be linked
  to a Processing one.
  - **Student side** (`SketchWorkspace.jsx`, rendered by `ProjectPage.jsx`
    when `project.kind === 'sketch'`): students write and test in real
    Processing on their own machine and PASTE the code in; code on the left,
    the running sketch on the right. The editor is the same CodeMirror + Java
    mode + accessible colour theme (and font-size control) as the Java editor -
    Processing's syntax is Java's - with Ctrl/Cmd+Enter bound to Run inside it
    (keep the extensions array stable: a new one rebuilds the editor and drops
    the cursor). Tabs of code are snapshotted into
    `submissions.files` (same shape as a gist snapshot) by the `submitSketch`
    action (`submissions/index.ts`; validation in `_shared/sketchFiles.ts`).
    Their data files (images, a `.vlw` font, text/csv) are uploaded one at a
    time to the **`sketch-assets`** Edge Function, which stores them in the
    private `sketch-assets` Storage bucket and indexes them in `sketch_assets`
    (5 MB/file, 25 MB/sketch, no SVG/audio). Only the owning student can
    upload/remove; the student or the teacher who owns the course can `list`
    (short-lived signed URLs). Deleting a submission/project/course removes
    the stored files first (`_shared/sketchAssetStorage.ts`) - the rows
    cascade but Storage objects do not.
  - **Teacher side**: grading uses the existing `GradingQueue` and
    `ProjectSubmissionViewer`; for a sketch both gain the same **Feedback /
    Testing** toggle a Coding Assignment has (`SketchTestingPanel.jsx`). Testing
    runs the student's code with their uploaded files, shows which files the
    code asks for that were never uploaded, and has **Download for Processing**
    (a correctly named sketch folder zip to open in real Processing - the
    fallback when the in-browser run looks wrong).
  - **Problem sets (several programs per assignment)**: `projects.parts` is an
    optional list `[{ id, title, description, points }]` (migration 0037;
    empty = one program, the original behavior). Each part's `id` is stable for
    life - a student's code and the teacher's per-program scores are filed under
    it, so renaming/reordering is always safe. A student's tabs for a part are
    stored in the SAME `submissions.files` list as `{ part, filename:
    "<partId>/Tab.pde", content }` - the path prefix keeps two programs' `Sketch`
    tabs from colliding, so line comments (keyed by filename), the grading tabs
    and the review export all work unchanged; `lib/processing/programs.js` is the
    only place that knows the convention. Per-program scores go in
    `submissions.question_scores` keyed by part id (the column an FRQ keeps its
    per-question scores in) with `score` = their sum, exactly like an FRQ.
    **`question_scores` is withheld until release** (`withheldIfUnreleased`) - it
    is the score broken down, so it must be gated with the score. Files are
    shared by the whole assignment (not per program). Instructions + sample-output
    screenshots live on each part (`description`, `images`), or - for a
    single-program assignment - in `projects.brief` (migration 0038); the student's
    Code view shows them side by side (`ProgramBrief`), and `BriefEditor` is the
    one teacher-side editor for both. Grading a sketch opens on its **Output**
    (not its code) with the score/comment column beside it; **Code** is the other
    tab, and the open program is shared between the two. **Full credit**
    buttons appear wherever a maximum is known: a problem set fills every program
    that has points, and a single program uses `projects.points_possible`
    (migration 0039, optional - no total means no button, since there is nothing
    to give full credit of). **Starter code is
    per program** (`parts[].starter`, empty = blank editor): a program opens on
    its starter only when nothing is saved for it yet (a draft or turn-in wins,
    even if cleared on purpose), and the student can "Reset to starter code". The
    old assignment-wide `starter_files` still drives a single-program sketch, and
    is ignored (and hidden in the form) once programs are listed. The teacher's
    **Preview as student** button on a sketch opens the real `SketchWorkspace`
    full screen with `preview` set (no draft, no uploads to the server, Turn in
    off), fed by the same sanitized `previewAsStudent` payload a student gets -
    so it cannot drift from the student page; Java/other work keeps the older
    summary dialog.
  - **Written questions + bonus programs** (migration 0040). `projects.questions` is an
    optional list `[{ id, prompt, points, code }]` of text-answer questions that come BEFORE
    the programs (a "Written" step in the student's strip; `WrittenQuestions` in
    `SketchWorkspace.jsx`). A student's answers are `submissions.answers`
    (`{ [questionId]: text }`), turned in with the code by `submitSketch` and validated by
    `normalizeAnswers`; answering is enough to turn something in (no code is allowed when
    there are answers). Scores go in `submissions.question_scores` under the question's id,
    in the same object as the per-program scores, so ids must never collide - the projects
    function reserves `main` and every program id when it normalizes questions.
    `lib/processing/programs.js`'s `scoreItems()` is the one list of everything scorable
    (questions, then programs; a single program with questions gets a `main` slot) and
    `itemsTotalPoints()` its total. `parts[].optional` marks a **bonus** program: not
    required (never counted in "nothing written yet"), and its points are extra credit
    outside the total (and outside Full credit). Teacher UI: `QuestionsEditor`, a bonus
    checkbox in `ProgramsEditor`, `WrittenAnswers` above the code in both graders, answers
    in the student's results view and in the review export (`answers.md` per student).
    A code-style question (`code: true`) just gets a monospace box.
  - **Scratch editing while grading.** The Output view has an **Edit code** button
    (`SketchTestingPanel.jsx`): an editor beside the running sketch so the teacher can
    change a student's code and re-run it. Edits live only in a module-level map in that
    file (per submission + program), are never sent anywhere, and "Back to their code"
    restores the original - what the student turned in is never touched.
  - **Turning a sketch in again.** From the student dashboard a turned-in sketch has an
    "Open it to change and turn in again" button (it routes back to `/project?id=`; the
    WorkItem carries `project_kind` so only sketches get it). If the sketch was already
    graded, `submitSketch` archives that version into `submission_versions` and clears the
    grade (score, per-program scores, comments, line comments, release) so the new work is
    back in the teacher's grading queue - exactly what `reopenMine` does for a hand-graded
    Coding Assignment, and the grading window shows it as Resubmitted with the old version.
    Without this, new code sat under the old grade and never reappeared in the queue. (A
    gist `submitProject` resubmit does not do this - unchanged, pre-existing behavior.) An
    **inactive** assignment can't be reopened at all and drops off the student's dashboard.
  - **How the code runs** (`src/lib/processing/`, `SketchRunner.jsx`): Processing.js
    (vendored at `src/vendor/processing.min.js`, MIT) translates the Java-syntax
    sketch to JS inside an iframe with `sandbox="allow-scripts"` and **no
    `allow-same-origin`**, so student code cannot touch the page's cookies or
    Supabase session; the only channel is `postMessage` (protocol documented at
    the top of `frameRunner.js`). Don't add `allow-same-origin`. Both
    Processing.js and `frameRunner.js` are imported as raw text and loaded
    lazily (own chunk, only fetched on first Run). Images reach the iframe as
    `data:` URLs so the canvas is never tainted.
  - **`javaFixes.js` is load-bearing**: Processing.js inherits JavaScript's
    number semantics, so `1500/1000` is 1.5 and `int x; x *= 1.5` doesn't
    truncate. The preprocessor rewrites int division / int compound assignment
    to `int(...)` ONLY when it can prove both sides are int (otherwise it leaves
    the expression alone), renames a method that shares a name with a variable
    (legal Java, a crash in JS), renames a variable that shares a name with a Processing
    function it also calls (`int size = 150;` + `size(400, 400);` works in Java; found in 5
    of 230 real sketches), and strips `import` lines. Run its unit tests
    with `node src/lib/processing/javaFixes.test.js` after touching it.
  - **Missing semicolons stop a run** (`lib/processing/syntaxCheck.js`). Processing.js
    is JavaScript underneath and silently inserts semicolons, so code real Processing
    rejects ("Missing a semicolon") would otherwise run here. `SketchRunner` refuses
    to run and names the lines; the turn-in dialog warns but allows. It is a
    token scan and **deliberately conservative** - a false "error" would stop a
    student running correct code, so anything ambiguous (a line that may continue,
    a loop header, an enum) is let through. Measured on a teacher's folder of 244
    real sketches: 0 false alarms, 99.8% of deliberately removed semicolons caught.
    Run `node src/lib/processing/syntaxCheck.test.js` after touching it.
  - **Errors name the student's line** (`lib/processing/errorLocation.js`). Processing.js
    translates their code into different JavaScript, so a raw error's line number is
    meaningless to them. The frame sends the stack + generated code up (`type: 'error'`),
    and the parent finds the student's line: the stack gives the generated line and the
    function it was in; the generated code keeps one statement per line with the same
    identifiers (but moves classes and drops comments, so lines can't just be counted), so it
    narrows to that function, keeps lines that mention the name the error complains about,
    and picks the best word-for-word match. It declines rather than guess. Measured on 47
    real sketches broken on a known line: 47/47 right (also 47/47 with the name hint
    withheld). Errors Processing.js throws as plain text (an unloaded image, delay()) have no
    stack, so no line. `syntaxCheck.js` also checks brackets pair up (Processing.js
    happily runs a missing `}`), with the same conservative stance. The sketch runs in
    **strict mode** (falling back to sloppy if strict rejects the translated code) so
    assigning to an undeclared name is an error, as in Java - checked against 227 real
    sketches: it broke none. The iframe's canvas id is `__pj_canvas` on purpose: an element
    id becomes a global, and the old `c` silently satisfied a student's forgotten `int c`.
  - Known limits (by design, not bugs): Processing.js is a 2018 translator, so
    libraries (Sound, Video), `loadTable`/JSON/XML and P3D are unsupported or
    untested; `.vlw` fonts become the default font; `println(3.0)` prints `3`.
    `tools/processing-tester/` is the standalone prototype this grew from
    (open `index.html`); the site does not depend on it.

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
- A Processing change touches several functions: deploy `courses`, `projects`, `submissions` and `sketch-assets`, and apply `0036_processing_sketches.sql` (it also creates the private `sketch-assets` bucket).
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