-- Two things aimed squarely at cutting grading time.

-- 1) A per-teacher bank of reusable comments. The same handful of remarks get
-- written thirty times a year ("check your loop bounds", "this works but
-- recomputes the total every pass"), so they are worth saving once. use_count
-- drives the ordering: the ones a teacher actually reaches for float to the
-- top instead of them scanning an alphabetical list.
create table comment_bank (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  use_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index comment_bank_teacher_idx on comment_bank(teacher_id);
alter table comment_bank enable row level security;

-- 2) A coding problem can now be graded by hand instead of by tests. Same
-- table on purpose: a "review" problem still has a course, unit, due date,
-- description, starter code and student submissions, and duplicating all of
-- that into a fourth table would mean four places to fix every future change.
-- 'auto'   - the existing autograded behaviour, checked by test cases
-- 'review' - no tests; the teacher runs the code and scores it themselves
alter table coding_problems
  add column grading_kind text not null default 'auto'
  check (grading_kind in ('auto', 'review'));

-- A review problem needs somewhere to put a mark, since no harness produces
-- one. Autograded problems keep using points_possible from their test cases.
alter table coding_problems add column manual_points integer;

-- Written feedback attached to specific lines of a student's submission.
-- Shape: [{ "line": 12, "body": "this recomputes the total every pass" }]
-- Line numbers stay valid because a submission is a frozen snapshot - the
-- student cannot edit the code out from under the comments.
alter table submissions add column line_comments jsonb not null default '[]'::jsonb;
