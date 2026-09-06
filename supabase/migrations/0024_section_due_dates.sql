-- Per-section due date override: a teacher with more than one block on a
-- single roster (see sections) can give one block a different deadline
-- than the rest, without turning it into a second, separate assignment.
--
-- One shared table across all three work kinds rather than three
-- near-identical ones, matching how submissions already carries three
-- nullable FK columns for the same "which kind of work is this" reason.
-- Exactly one of the three work columns is set per row (enforced below);
-- the base due_date on the work item itself remains what anyone without a
-- section-specific override sees.
create table section_due_dates (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references assignments(id) on delete cascade,
  coding_problem_id uuid references coding_problems(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  due_date timestamptz not null,
  created_at timestamptz not null default now(),
  constraint section_due_dates_one_work_ref check (
    (case when assignment_id is not null then 1 else 0 end) +
    (case when coding_problem_id is not null then 1 else 0 end) +
    (case when project_id is not null then 1 else 0 end) = 1
  )
);

-- One override per (work item, section) - re-saving from the form replaces
-- it rather than accumulating duplicates. Partial (one per work-ref column)
-- since a plain unique(assignment_id, section_id) would not stop a
-- coding_problem_id row and a project_id row from colliding on a shared
-- (null, null, section_id) pair otherwise.
create unique index section_due_dates_assignment_key
  on section_due_dates(assignment_id, section_id) where assignment_id is not null;
create unique index section_due_dates_coding_key
  on section_due_dates(coding_problem_id, section_id) where coding_problem_id is not null;
create unique index section_due_dates_project_key
  on section_due_dates(project_id, section_id) where project_id is not null;

alter table section_due_dates enable row level security;
