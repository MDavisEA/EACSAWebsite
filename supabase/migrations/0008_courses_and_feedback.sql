-- ============================================================================
-- Courses + rosters, so the teacher can see who has NOT turned something in
-- (the submissions table only ever knew about students who did). Plus the
-- pieces needed to close the feedback loop on projects and to flag late or
-- edited-after-submission work.
-- ============================================================================

create table courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table courses enable row level security;

create trigger courses_updated_at before update on courses
  for each row execute function set_updated_at();

-- One row per student on a course roster. A real table rather than jsonb on
-- courses because roster entries get matched against submissions (by email
-- where available, which is what Google sign-in gives us) and that is much
-- cleaner to index and query than digging through an array.
create table roster_students (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  student_name text not null,
  email text,
  created_at timestamptz not null default now()
);

create index roster_students_course_idx on roster_students(course_id);
create index roster_students_email_idx on roster_students(lower(email));

alter table roster_students enable row level security;

-- A project belongs to at most one course. Teaching the same project to
-- several sections is handled by duplicating the project (the Duplicate
-- button already exists) or by putting every section in one course - both
-- simpler than a join table, and a join table stays available later if the
-- one-to-one turns out to be wrong.
alter table projects add column course_id uuid references courses(id) on delete set null;
alter table projects add column due_date timestamptz;

-- Feedback on a project stays invisible to the student until the teacher
-- explicitly releases it, so an AI-assisted review is never shown to a
-- student before a human has looked at it. score/teacher_comments already
-- exist on submissions and are reused.
alter table submissions add column feedback_released boolean not null default false;

-- The gist's own last-modified time as of when we snapshotted it. Compared
-- against a fresh fetch later to answer "was this edited after it was
-- turned in?" - an observable fact, rather than a guess about authorship.
alter table submissions add column gist_updated_at timestamptz;
