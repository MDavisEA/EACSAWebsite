-- ============================================================================
-- AP CSA Practice App — Supabase schema
-- Replaces Base44's entities. RLS is enabled on every table with NO permissive
-- policies for anon/authenticated roles: nothing is readable or writable
-- directly from the browser. Every read/write goes through an Edge Function
-- using the service_role key, which enforces the actual authorization logic
-- (teacher JWT check, or per-submission session token check). This is a
-- stricter model than the old app had — see MIGRATION_GUIDE.md.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- teacher_profiles: allowlist of who counts as a teacher.
-- A row in auth.users is NOT enough on its own to grant teacher access —
-- the caller's user id must also exist here. This means even if Supabase
-- Auth sign-ups were ever accidentally left open, an unrecognized new
-- account still can't touch teacher-only data.
-- ----------------------------------------------------------------------------
create table teacher_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

alter table teacher_profiles enable row level security;
-- No policies added on purpose: only the service role (used inside Edge
-- Functions) can read/write this table.

-- ----------------------------------------------------------------------------
-- assignments: FRQ assignments (was the Assignment entity)
-- ----------------------------------------------------------------------------
create table assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  directions text,
  reference_sheet_url text,
  answer_key_url text,
  sort_order numeric,
  questions jsonb not null default '[]'::jsonb,
  time_limit_minutes numeric,
  due_date timestamptz,
  is_active boolean not null default true,
  featured boolean not null default false,
  show_answer_key boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table assignments enable row level security;

-- ----------------------------------------------------------------------------
-- coding_problems: runnable Java assignments (new — was CodingProblem.jsonc)
-- ----------------------------------------------------------------------------
create table coding_problems (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description_html text,
  language text not null default 'java',
  class_name text not null default 'Solution',
  starter_code text,
  harness_type text not null check (harness_type in ('exact_match', 'property_check')),
  method_name text not null,
  method_arg_types jsonb not null default '[]'::jsonb,
  trial_count integer not null default 30,
  test_cases jsonb not null default '[]'::jsonb,
  points_possible numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table coding_problems enable row level security;

-- ----------------------------------------------------------------------------
-- submissions: one row per student attempt, FRQ or coding (was Submission entity)
-- ----------------------------------------------------------------------------
create table submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references assignments(id) on delete cascade,
  coding_problem_id uuid references coding_problems(id) on delete cascade,

  student_name text not null,
  access_code text unique,

  -- Security upgrade over the old app: a random secret handed to the
  -- student's browser once, at creation. Every update to a submission
  -- requires this token, so another student can't edit someone else's
  -- in-progress work just by knowing/guessing their name. See
  -- MIGRATION_GUIDE.md for the resume-flow trade-off this implies.
  session_token text not null default encode(gen_random_bytes(24), 'hex'),

  -- FRQ fields
  responses jsonb not null default '{}'::jsonb,
  score numeric,
  question_scores jsonb not null default '{}'::jsonb,
  teacher_comments text,
  part_comments jsonb not null default '{}'::jsonb,

  -- Coding fields
  code text,
  test_results jsonb not null default '[]'::jsonb,
  autograde_score numeric,
  run_history jsonb not null default '[]'::jsonb,
  compile_error text,
  style_score numeric,
  style_comments text,

  submitted boolean not null default false,
  submitted_at timestamptz,
  time_spent_seconds numeric,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint submission_has_a_parent check (
    assignment_id is not null or coding_problem_id is not null
  )
);

create index submissions_assignment_idx on submissions(assignment_id);
create index submissions_coding_problem_idx on submissions(coding_problem_id);
create index submissions_access_code_idx on submissions(access_code);

alter table submissions enable row level security;

-- ----------------------------------------------------------------------------
-- keep updated_at fresh
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger assignments_updated_at before update on assignments
  for each row execute function set_updated_at();
create trigger coding_problems_updated_at before update on coding_problems
  for each row execute function set_updated_at();
create trigger submissions_updated_at before update on submissions
  for each row execute function set_updated_at();
