-- A second try at a wrong multiple-choice pick, for partial credit. The
-- first wrong guess costs nothing and reveals nothing (see submitLoopAnswer
-- in submissions/index.ts) - only the FINAL outcome (right on try 2, or
-- still wrong) actually changes the score, using this rate instead of full
-- credit when they get it right the second time.
alter table loop_assignments add column partial_credit numeric not null default 0.5;
