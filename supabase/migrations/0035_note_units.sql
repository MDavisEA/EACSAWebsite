-- Notes can now be filed into one of their course's units, so a class's
-- reference material reads as folders (Unit 1 notes, Unit 2 notes, ...)
-- instead of one long flat list. Same units the Assignments tab uses - not a
-- separate folder concept - and nullable, so every existing note simply
-- shows up as unfiled until the teacher moves it. Deleting a unit nulls the
-- reference, the same as for work in it, rather than deleting the notes.
alter table notes add column unit_id uuid references units(id) on delete set null;
create index notes_unit_id_idx on notes(unit_id);
