-- Backfills the work that existed before courses meant ownership, then makes
-- course_id required. Done as its own migration so the structural change above
-- stays separate from the one-off data move.

-- Everything currently on the site belongs to the only teacher there has been.
update courses set teacher_id = '4d9fc97b-a6db-4cfb-9b2c-f60af1f11459' where teacher_id is null;

-- A home for work that predates courses. Named so it is obvious it was made by
-- the migration rather than chosen.
insert into courses (id, name, teacher_id)
values ('00000000-0000-4000-8000-000000000001', 'AP CSA (unfiled)', '4d9fc97b-a6db-4cfb-9b2c-f60af1f11459')
on conflict (id) do nothing;

insert into units (id, course_id, name, position)
values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Unfiled', 0)
on conflict (id) do nothing;

update assignments
  set course_id = '00000000-0000-4000-8000-000000000001',
      unit_id = '00000000-0000-4000-8000-000000000002'
  where course_id is null;
update coding_problems
  set course_id = '00000000-0000-4000-8000-000000000001',
      unit_id = '00000000-0000-4000-8000-000000000002'
  where course_id is null;
update projects
  set course_id = '00000000-0000-4000-8000-000000000001',
      unit_id = '00000000-0000-4000-8000-000000000002'
  where course_id is null;

-- Work already filed under a real course still needs a unit to live in.
insert into units (course_id, name, position)
select c.id, 'Unfiled', 0
from courses c
where not exists (select 1 from units u where u.course_id = c.id);

update assignments a set unit_id = u.id
  from units u where u.course_id = a.course_id and u.name = 'Unfiled' and a.unit_id is null;
update coding_problems p set unit_id = u.id
  from units u where u.course_id = p.course_id and u.name = 'Unfiled' and p.unit_id is null;
update projects pr set unit_id = u.id
  from units u where u.course_id = pr.course_id and u.name = 'Unfiled' and pr.unit_id is null;

-- With every row filed, ownership can be made structural rather than a
-- convention: a piece of work with no course would have no owner.
alter table courses alter column teacher_id set not null;
alter table assignments alter column course_id set not null;
alter table coding_problems alter column course_id set not null;
alter table projects alter column course_id set not null;
