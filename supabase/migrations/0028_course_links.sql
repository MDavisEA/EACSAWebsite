-- A course can be linked to another teacher's - once linked, any new
-- assignment/coding problem/project/note added to the SOURCE course gets a
-- copy created in the TARGET course automatically. The copy is a normal,
-- fully independent row from the moment it is created: editing either side
-- afterward never touches the other. Matches the existing "any teacher can
-- browse and copy any other teacher's coding problems" trust model already
-- in listShared/copyToMyCourse - no separate opt-in flag, since this is a
-- small department where every teacher already sees everyone else's work.
create table course_links (
  id uuid primary key default gen_random_uuid(),
  source_course_id uuid not null references courses(id) on delete cascade,
  target_course_id uuid not null references courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (source_course_id, target_course_id)
);

create index course_links_source_idx on course_links(source_course_id);
create index course_links_target_idx on course_links(target_course_id);

alter table course_links enable row level security;
