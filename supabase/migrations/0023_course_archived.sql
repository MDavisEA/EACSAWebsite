-- Lets a teacher get an old year's class out of the "My Classes" grid
-- without deleting it - everything about the course (units, rosters,
-- assignments, submissions, grades) stays exactly as it is; this only
-- changes whether it shows up in the main list. Nothing else in the app
-- (grading queues, student records, exports) filters on this - archiving
-- is purely about decluttering the class list, not retiring the data.
alter table courses add column archived boolean not null default false;
