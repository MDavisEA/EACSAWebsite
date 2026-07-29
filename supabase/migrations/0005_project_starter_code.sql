-- Starter code the teacher hands out for a project. Shown to students on
-- their submission page, and included in the export so an AI review pass
-- knows what was provided rather than mistaking it for the student's own
-- work (the same reason MOSS's BASE_FILES setting exists - avoids flagging
-- shared boilerplate as either copied-from-each-other or student-authored).
alter table projects add column starter_code text;
