-- Loop Practice: a DeltaMath-style drill tool for for-loops. Two item types
-- (trace-the-output, multiple-choice "which loop produces this output"),
-- authored into a bank and assembled into assignments with a target score
-- and a per-wrong-answer penalty.
--
-- Ownership departs from the usual pattern on purpose: every other work
-- table (assignments/coding_problems/projects) derives its owner from
-- course_id -> courses.teacher_id, and teacherOwnsCourse() treats a null
-- course_id as "nobody owns this" (see _shared/teacherAuth.ts). A loop
-- assignment can be standalone - not filed under any course - so both
-- tables here carry a real teacher_id instead.

create table loop_problems (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teacher_profiles(id) on delete cascade,
  -- The AI-generated bank's own string id (e.g. "for-basic-001"). Kept so a
  -- teacher can re-paste an updated batch without duplicating rows.
  source_key text,
  type text not null check (type in ('trace', 'multiple_choice')),
  topic text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  code text,              -- trace only (multiple_choice's code lives per-choice)
  expected_output text,  -- trace only
  shown_output text,     -- multiple_choice only
  choices jsonb,         -- multiple_choice only: [{code, correct, why_tempting}]
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index loop_problems_teacher_idx on loop_problems(teacher_id);
create unique index loop_problems_teacher_source_key_idx
  on loop_problems(teacher_id, source_key) where source_key is not null;

create table loop_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teacher_profiles(id) on delete cascade,
  title text not null,
  course_id uuid references courses(id) on delete set null,  -- null = standalone
  unit_id uuid references units(id) on delete set null,
  target_score numeric not null default 10,
  wrong_penalty numeric not null default 0.5,
  topic_filter jsonb,    -- array of topics, null = all
  type_filter text not null default 'both' check (type_filter in ('trace', 'multiple_choice', 'both')),
  difficulty_filter jsonb,  -- array of difficulties, null = all
  due_date timestamptz,
  is_active boolean not null default true,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index loop_assignments_teacher_idx on loop_assignments(teacher_id);
create index loop_assignments_course_idx on loop_assignments(course_id);

-- One submissions row per student per loop_assignment, holding running
-- progress rather than a single answer - submitted/submitted_at are reused
-- to mean "reached target_score," and loop_attempt_log is shaped like the
-- existing run_history column (per-attempt history for class-wide insight).
alter table submissions add column loop_assignment_id uuid references loop_assignments(id) on delete cascade;
alter table submissions add column loop_score numeric not null default 0;
alter table submissions add column loop_correct_count integer not null default 0;
alter table submissions add column loop_wrong_count integer not null default 0;
alter table submissions add column loop_attempt_log jsonb not null default '[]';
create index submissions_loop_assignment_idx on submissions(loop_assignment_id);

alter table submissions drop constraint submission_has_a_parent;
alter table submissions add constraint submission_has_a_parent check (
  assignment_id is not null or coding_problem_id is not null
  or project_id is not null or loop_assignment_id is not null
);

alter table loop_problems enable row level security;
alter table loop_assignments enable row level security;
-- No policies, same as every other table: service_role only, via Edge Functions.

create trigger loop_problems_updated_at before update on loop_problems
  for each row execute function set_updated_at();
create trigger loop_assignments_updated_at before update on loop_assignments
  for each row execute function set_updated_at();
