-- Splits a roster row's name into first_name/last_name instead of one
-- combined string the teacher has to type in the right order. student_name
-- becomes a generated column (first_name + last_name) rather than a second,
-- separately-writable field, so the two can never drift apart - every read
-- path that already selects student_name (matching submissions by name,
-- ordering the roster, the Students tab, CSV export-adjacent logic) keeps
-- working completely unchanged, since a generated column reads exactly like
-- a normal one.
alter table roster_students add column first_name text;
alter table roster_students add column last_name text;

-- Backfill from whatever is already on the roster: the WHOLE existing name
-- goes into first_name, last_name blank, rather than guessing at a split.
-- Checked against this project's real data first - it turned out to be
-- "Last First" order (a gradebook export quirk, on top of the
-- quote-stripping bug fixed just before this), so a "split on the last
-- space" heuristic would have silently swapped first and last on every
-- real row. Left as one field instead: still visible, still correct as a
-- whole, and an honest "needs a fix" rather than a wrong split nobody
-- would notice. A re-upload (the CSV parser now splits into these same two
-- columns itself) or a manual edit is the real fix.
update roster_students set first_name = coalesce(trim(student_name), ''), last_name = '';

alter table roster_students alter column first_name set not null;
alter table roster_students alter column first_name set default '';
alter table roster_students alter column last_name set not null;
alter table roster_students alter column last_name set default '';

alter table roster_students drop column student_name;
alter table roster_students add column student_name text
  generated always as (trim(both ' ' from first_name || ' ' || last_name)) stored;
