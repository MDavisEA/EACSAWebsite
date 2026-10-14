-- How many points a single-program project is worth. Optional and null by
-- default (every existing project is unchanged). It is what lets the grading
-- views offer a one-click Full credit: without a maximum there is nothing to
-- give full credit OF. A multi-program sketch does not use it - its total is the
-- sum of each program's own points (projects.parts).
alter table projects add column points_possible numeric;
