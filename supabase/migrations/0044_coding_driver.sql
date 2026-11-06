-- A teacher-written driver for a Coding Assignment: the class with main() that
-- builds the student's object and exercises it. The student writes only the
-- class; "Run My Code" combines the two on the server and shows them the
-- output. Stored on the problem and never sent to students (see
-- sanitizeForStudent in coding-problems/index.ts, which only reports that one
-- exists) - they see what the driver prints, not how it decides.
alter table coding_problems add column driver_code text;
