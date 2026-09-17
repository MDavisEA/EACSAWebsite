-- Tracks whether a student has already been emailed about a submission's
-- grade, so re-saving (fixing a typo, adding a late comment) never sends a
-- second "you have new feedback" email for the same round of grading. Reset
-- to null by reopenMine when a Coding Assignment is reopened for another
-- attempt, so a genuinely new round of grading notifies again.
alter table submissions add column graded_notified_at timestamptz;
