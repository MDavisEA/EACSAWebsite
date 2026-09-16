-- The partial unique index from 0030 (WHERE source_key IS NOT NULL) can't be
-- used as an ON CONFLICT arbiter by a plain `upsert(rows, {onConflict:
-- 'teacher_id,source_key'})` call, which generates no WHERE predicate -
-- Postgres refuses with "no unique or exclusion constraint matching the ON
-- CONFLICT specification". A plain composite unique index works instead:
-- NULLs are distinct from each other by default, so hand-authored problems
-- (source_key null) still never collide with one another - only two rows
-- sharing the same real source_key for the same teacher do.
drop index if exists loop_problems_teacher_source_key_idx;
create unique index loop_problems_teacher_source_key_idx
  on loop_problems(teacher_id, source_key);
