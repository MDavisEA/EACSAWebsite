-- A unit the teacher is done with should be collapsible without losing what
-- is inside it - just a per-unit display preference, persisted so it stays
-- collapsed across devices and after a cache clear rather than living only in
-- one browser's localStorage.
alter table units add column collapsed boolean not null default false;

-- A submission a teacher has decided not to grade (a duplicate, an empty
-- placeholder, a student who dropped) needs a way to leave the "needs
-- grading" pile without forcing a score onto it. Score stays null - this is
-- "not grading it," not "grading it as zero."
alter table submissions add column grading_skipped boolean not null default false;
