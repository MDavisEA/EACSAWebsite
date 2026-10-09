-- ============================================================================
-- AP CSP / Processing support.
--
-- A course now has a language: 'java' (everything that existed before - FRQ,
-- Mini Problems, Coding Assignments, Projects turned in as a gist) or
-- 'processing' (AP CSP: Processing sketches). A Processing course reuses
-- Projects rather than adding a fifth kind of work, because everything a
-- sketch needs after it is turned in - rubric, line comments, release-gated
-- feedback, reply threads, grade emails, section due dates, the "who has not
-- turned in" roster diff, linked courses - is exactly what Projects already
-- do. The only thing that differs is HOW it is turned in (pasted code plus
-- uploaded images, not a gist URL), which is what projects.kind records.
-- ============================================================================

alter table courses add column language text not null default 'java'
  check (language in ('java', 'processing'));

-- 'gist' = the original behaviour (a Gist URL, snapshotted at submit time).
-- 'sketch' = a Processing sketch: tabs of pasted code stored in
-- submissions.files, plus uploaded files in sketch_assets. Set server-side from
-- the course's language when a project is created - never trusted from the
-- client - so a sketch project can only exist in a Processing course.
alter table projects add column kind text not null default 'gist'
  check (kind in ('gist', 'sketch'));

-- The data/ folder of a sketch: images (and the occasional .vlw font or text
-- file) a student's code loads by name. The bytes live in Storage; this table
-- is the index, and the only thing the Edge Function trusts for authorization
-- (storage_path is generated server-side, never taken from the request).
create table sketch_assets (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  name text not null,
  size_bytes integer not null,
  content_type text not null,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

-- A name identifies a file inside one sketch, case-insensitively: Processing
-- on Mac/Windows resolves "Dice.PNG" and "dice.png" to the same file, and two
-- assets differing only by case would make loadImage ambiguous.
create unique index sketch_assets_submission_name_idx on sketch_assets (submission_id, lower(name));
create index sketch_assets_submission_idx on sketch_assets (submission_id);

alter table sketch_assets enable row level security;

-- Private bucket: nothing here is ever served by a public URL. The Edge
-- Function hands out short-lived signed URLs after checking the caller owns
-- the submission (student) or the course it belongs to (teacher).
-- file_size_limit is a second line of defence behind the Edge Function's own
-- check (5 MB per file).
insert into storage.buckets (id, name, public, file_size_limit)
values ('sketch-assets', 'sketch-assets', false, 5242880)
on conflict (id) do nothing;
