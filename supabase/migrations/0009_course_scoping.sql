-- Lets any of the three kinds of work be aimed at one course's roster, the
-- way projects already could. Nullable on purpose: NULL means "everyone", so
-- every existing assignment and problem keeps showing to all students and
-- nothing has to be backfilled. Setting a course narrows it to that roster.
alter table assignments add column course_id uuid references courses(id) on delete set null;
alter table coding_problems add column course_id uuid references courses(id) on delete set null;

create index assignments_course_idx on assignments(course_id);
create index coding_problems_course_idx on coding_problems(course_id);

-- Coding problems were the only work type with no deadline, which made them
-- the odd one out on a dashboard that sorts by what is due next.
alter table coding_problems add column due_date timestamptz;
