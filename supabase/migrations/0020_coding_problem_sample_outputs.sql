-- Same shape and same reasoning as projects.sample_outputs (migration 0019):
-- what the finished program should look like when it runs, so it can be
-- offered on a Mini Problem or Coding Assignment too, not only a Project.
alter table coding_problems add column sample_outputs jsonb not null default '[]'::jsonb;
