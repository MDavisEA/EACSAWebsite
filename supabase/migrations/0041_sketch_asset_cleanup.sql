-- Uploaded sketch images are deleted a week after the student's grade became visible to them,
-- so they do not pile up against the free plan's 1 GB of file storage (see the
-- sketch-cleanup Edge Function, which a daily pg_cron job calls).
--
-- feedback_visible_at: when a Project's score first became visible to the student in this round
-- of grading (feedback released AND scored). Set by saveGrade, cleared when it is un-released or
-- the student turns in again after being graded. The one-week clock runs from it.
-- assets_purged_at: when their images were removed, so the teacher's and the student's pages can
-- say "removed after grading" instead of just showing a missing file.
alter table submissions add column feedback_visible_at timestamptz;
alter table submissions add column assets_purged_at timestamptz;

-- Work that is already graded and released starts its week today. Without this the first run
-- would see a NULL clock and either skip it forever or (worse, if written differently) treat it
-- as long overdue and delete images a teacher is still looking at.
update submissions set feedback_visible_at = now()
where project_id is not null and feedback_released = true and score is not null;

create extension if not exists pg_net;
create extension if not exists pg_cron;
