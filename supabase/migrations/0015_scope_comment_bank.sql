-- A saved comment used to show up while grading anything at all, which got
-- noisy: a remark written for one specific assignment kept surfacing while
-- grading something unrelated. From here on, a comment is scoped to the one
-- piece of work it was saved from, and only shows up there.
--
-- "Use it everywhere" stays possible - it just has to be chosen, not the
-- default. A comment with all three of these null IS the "everywhere" one;
-- there is no separate flag, because null-in-all-three already means
-- "not tied to anything in particular."
--
-- Existing comments predate this and were being used across every problem a
-- teacher graded - left alone (all three columns default to null on an
-- existing row), which makes them exactly the deliberately-global set now,
-- rather than orphaning them or guessing which single problem they belonged to.
alter table comment_bank add column assignment_id uuid references assignments(id) on delete cascade;
alter table comment_bank add column coding_problem_id uuid references coding_problems(id) on delete cascade;
alter table comment_bank add column project_id uuid references projects(id) on delete cascade;

create index comment_bank_assignment_idx on comment_bank(assignment_id);
create index comment_bank_coding_problem_idx on comment_bank(coding_problem_id);
create index comment_bank_project_idx on comment_bank(project_id);
