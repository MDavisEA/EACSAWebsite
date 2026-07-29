-- ============================================================================
-- Projects: big assignments turned in as a GitHub Gist link, reviewed with an
-- AI coding assistant (Claude/Cowork) against a rubric - not autograded, and
-- deliberately separate from coding_problems. A submission here is a single
-- "fetch the gist's .java files and snapshot them" action, not an in-browser
-- editor session, so it reuses the shared submissions table rather than
-- needing its own.
-- ============================================================================

create table projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description_html text,
  rubric_md text,
  review_prompt text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table projects enable row level security;

create trigger projects_updated_at before update on projects
  for each row execute function set_updated_at();

-- Nullable and additive - existing FRQ/coding submissions are untouched.
alter table submissions add column project_id uuid references projects(id) on delete cascade;
alter table submissions add column gist_url text;
alter table submissions add column files jsonb not null default '[]'::jsonb;
alter table submissions add column gist_captured_at timestamptz;

alter table submissions drop constraint submission_has_a_parent;
alter table submissions add constraint submission_has_a_parent check (
  assignment_id is not null or coding_problem_id is not null or project_id is not null
);

create index submissions_project_idx on submissions(project_id);
