-- A student must say whether they used an AI chatbot for help, and if so,
-- link the actual conversation - for both autograded/hand-graded Coding
-- Problems and Projects (they share the submissions table). Nullable so
-- existing rows (submitted before this existed) read as "never asked"
-- rather than a false "no AI help", which the teacher-facing views must
-- tell apart.
alter table submissions add column ai_help_used boolean;
alter table submissions add column ai_help_link text;

-- Defense in depth alongside the same check in the submissions and
-- run-java-tests Edge Functions: a submission cannot claim AI help without
-- actually supplying a link.
alter table submissions add constraint ai_help_link_required_if_used
  check (ai_help_used is not true or (ai_help_link is not null and length(trim(ai_help_link)) > 0));
