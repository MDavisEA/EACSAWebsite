-- The per-submission "won't grade" toggle (see 0016) covers the one-off case
-- - a duplicate, an empty placeholder. In practice a teacher's real pattern
-- is coarser: if they are not grading it for one student, they are not
-- grading it for the class, because the decision was really about the
-- assignment (a practice worksheet, an ungraded formative check), not about
-- any one submission. This is that decision, made once, on the work itself.
--
-- Deliberately not "is this graded automatically" - an autograded Mini
-- Problem already never appears as needing grading (see gradingCounts), so
-- this column only has real meaning for hand-graded work: FRQs, Coding
-- Assignments (coding_problems with grading_kind='review'), and Projects.
alter table assignments add column grading_skipped boolean not null default false;
alter table coding_problems add column grading_skipped boolean not null default false;
alter table projects add column grading_skipped boolean not null default false;
