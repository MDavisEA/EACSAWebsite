-- Restrict a Mini Problem / Coding Assignment to some of its course's sections
-- (blocks). Empty = everyone in the course, the original behavior, so every
-- existing row is unchanged. Enforced server-side in coding-problems and
-- submissions (see _shared/sectionAudience.ts) - section ids are plain
-- uuids with no FK because Postgres cannot enforce array element references;
-- the functions validate them against the course's own sections on write.
alter table coding_problems
  add column section_ids uuid[] not null default '{}';
