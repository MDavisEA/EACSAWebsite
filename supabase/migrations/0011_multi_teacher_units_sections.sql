-- Turns a single-teacher site into a departmental one, and gives a course the
-- shape the teacher actually uses: a course holds units (what the work is
-- grouped under) and sections (which period a student is in).
--
-- Ownership deliberately lives in ONE place: courses.teacher_id. Work belongs
-- to a course, so "who owns this assignment" is always answered by its course
-- rather than by a second copy of the answer that could drift out of step.
-- That is also why course_id becomes required below - an unfiled item would
-- have no owner, and until now it meant "show this to every student on the
-- site", which stops being safe the moment a second teacher has students.

alter table courses add column teacher_id uuid references auth.users(id) on delete cascade;

-- Units group work inside a course (Mod 1, Recursion, ...). position drives
-- display order so units read in teaching order, not creation order.
create table units (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index units_course_idx on units(course_id);

-- Sections are which period a student is in. They tag students only - work is
-- assigned to the whole course, because every section does the same work.
create table sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index sections_course_idx on sections(course_id);

-- A roster entry can sit in no section (uploaded before sections existed, or
-- the teacher has not split them up), so this stays nullable.
alter table roster_students add column section_id uuid references sections(id) on delete set null;
create index roster_students_section_idx on roster_students(section_id);

alter table assignments add column unit_id uuid references units(id) on delete set null;
alter table coding_problems add column unit_id uuid references units(id) on delete set null;
alter table projects add column unit_id uuid references units(id) on delete set null;
create index assignments_unit_idx on assignments(unit_id);
create index coding_problems_unit_idx on coding_problems(unit_id);
create index projects_unit_idx on projects(unit_id);

-- Same RLS posture as every other table here: on, with no client-facing
-- policy, so nothing is reachable from the browser except through an Edge
-- Function using the service role.
alter table units enable row level security;
alter table sections enable row level security;
