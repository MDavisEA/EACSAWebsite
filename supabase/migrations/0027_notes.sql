-- A teacher's own reference notes, tied to one class - separate from the
-- Assignments/Coding/Projects units entirely, since these are not turned in
-- or graded. Each note starts private (is_published false) and the teacher
-- flips it on when it is ready for that class's students to see.
create table notes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  content_html text not null default '',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_course_id_idx on notes(course_id);

-- Same pattern as every other table: RLS on, no client-facing policies - all
-- reads and writes go through the notes Edge Function with the service_role
-- key, which enforces ownership (teacher) and the publish gate (student).
alter table notes enable row level security;
