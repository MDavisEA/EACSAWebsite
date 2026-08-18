-- A reference solution for a coding problem: useful to the teacher while
-- grading, and useful to students afterwards for checking their own work
-- against it.
--
-- Released explicitly rather than shown as soon as it exists, for the obvious
-- reason: the key IS the answer, so anything automatic would hand it to
-- students who have not written their own solution yet. Two independent gates
-- enforce that (see sanitizeForStudent in coding-problems/index.ts): the
-- teacher must release it, AND a student only ever sees it on a submission
-- they have already turned in.
alter table coding_problems add column answer_key_code text;
alter table coding_problems add column answer_key_notes_html text;
alter table coding_problems add column answer_key_released boolean not null default false;
