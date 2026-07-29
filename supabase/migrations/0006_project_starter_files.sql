-- Starter code needs to hold more than one file (a small multi-class
-- project, not just a single snippet), so it moves to the same jsonb
-- {filename, content}[] shape submissions.files already uses - populated
-- either by dragging files in directly or by fetching a gist, same as a
-- student submission.
alter table projects add column starter_files jsonb not null default '[]'::jsonb;
alter table projects drop column starter_code;
