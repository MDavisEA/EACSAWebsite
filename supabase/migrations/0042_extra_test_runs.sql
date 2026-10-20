-- Extra practice test runs a teacher has granted ONE student on top of the
-- problem's max_test_runs (mid-quiz hiccup, a reset). Per submission, not per
-- problem, so it never changes what anyone else gets.
alter table submissions
  add column extra_test_runs integer not null default 0 check (extra_test_runs >= 0);
