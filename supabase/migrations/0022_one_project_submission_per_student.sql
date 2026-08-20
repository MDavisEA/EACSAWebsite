-- One submission per student per project, enforced by the database rather than
-- by a select-then-insert that two concurrent requests can both pass.
--
-- This became reachable when opening a project started creating a row
-- (startProject): that fires on page load rather than on a click, so two
-- near-simultaneous loads could both find nothing and both insert. A duplicate
-- then broke submitProject, whose own lookup uses maybeSingle() and errors on
-- more than one row - meaning a resubmit would insert yet another row instead
-- of updating, and the teacher would see the same student listed repeatedly.
--
-- Partial index: only project submissions are constrained this way. FRQ and
-- coding work deliberately allows several rows per student (reopen/resubmit
-- history), and legacy anonymous rows have no student_user_id at all.
create unique index if not exists submissions_one_per_project_student
  on submissions (project_id, student_user_id)
  where project_id is not null and student_user_id is not null;
