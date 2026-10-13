-- Instructions and sample-output screenshots for a SINGLE-program sketch:
--   { "description": "...", "images": ["https://...png", ...] }
-- A multi-program assignment keeps the same two things on each entry of
-- `parts` instead (migration 0037); this is the equivalent for an assignment
-- with no programs listed, so a student can read what to build beside what it
-- should look like without leaving the Code view. Empty by default, so every
-- existing project is unchanged. Only meaningful for kind = 'sketch'.
alter table projects add column brief jsonb not null default '{}'::jsonb;
