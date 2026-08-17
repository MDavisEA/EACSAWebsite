-- A unit holds all three kinds of work in one list, so they need to share one
-- ordering field. assignments already had sort_order from when FRQs were the
-- only draggable list; the other two are catching up rather than inventing a
-- second scheme.
alter table coding_problems add column sort_order integer;
alter table projects add column sort_order integer;

-- Existing rows get an order matching how they are currently displayed
-- (newest first was the old list order), so nothing jumps around the first
-- time a teacher opens a class after this ships.
with ordered as (
  select id, row_number() over (partition by unit_id order by created_at desc) - 1 as n
  from coding_problems
)
update coding_problems p set sort_order = ordered.n from ordered where ordered.id = p.id;

with ordered as (
  select id, row_number() over (partition by unit_id order by created_at desc) - 1 as n
  from projects
)
update projects p set sort_order = ordered.n from ordered where ordered.id = p.id;

with ordered as (
  select id, row_number() over (partition by unit_id order by coalesce(sort_order, 9999), created_at desc) - 1 as n
  from assignments
)
update assignments a set sort_order = ordered.n from ordered where ordered.id = a.id;
