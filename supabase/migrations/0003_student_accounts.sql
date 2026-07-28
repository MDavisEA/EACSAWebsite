-- ============================================================================
-- Student Google accounts: ties a submission to a real Supabase Auth user
-- (signed in via Google, restricted to the school domain server-side) instead
-- of relying solely on the anonymous session_token model. Nullable and
-- additive - existing rows and the session_token ownership path are
-- untouched, so anything already in progress keeps working.
-- ============================================================================

alter table submissions add column student_user_id uuid references auth.users(id) on delete set null;

create index submissions_student_user_idx on submissions(student_user_id);
