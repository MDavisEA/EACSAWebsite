-- Caps how many times a student can hit "Run My Tests" on one problem, so the
-- autograder can't be brute-forced against the visible test cases by guessing.
-- 5 by default; NULL means unlimited, for problems where that pressure is not
-- wanted. Existing problems get the default rather than being left unlimited,
-- since that is the behaviour worth having going forward.
alter table coding_problems add column max_test_runs integer default 5;
