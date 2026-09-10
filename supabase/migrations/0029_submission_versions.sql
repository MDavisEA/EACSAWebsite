-- A hand-graded Coding Assignment a student resubmits after it has already
-- been graded gets its current (graded) state snapshotted here first, then
-- the live submissions row resets to accept the new attempt - so the
-- grading queue only ever has one current thing to grade for that student,
-- never two, but nothing the teacher already wrote is lost. The snapshot is
-- the whole submissions row as it stood at that moment (jsonb, not mirrored
-- columns), so this table never needs its own migration when submissions
-- gains a column.
create table submission_versions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  snapshot jsonb not null,
  archived_at timestamptz not null default now()
);

create index submission_versions_submission_id_idx on submission_versions(submission_id);

alter table submission_versions enable row level security;
