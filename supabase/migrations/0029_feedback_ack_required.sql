-- A teacher can require a student to actively confirm they read a specific
-- piece of feedback, instead of the existing "Reviewed" shelf which a
-- student moves things into entirely at their own discretion. Reuses that
-- same feedback_reviewed_at column for the actual acknowledgment - this
-- flag only changes how prominently a student sees it (a top-of-dashboard
-- "Outstanding Feedback" section instead of quietly sitting in their normal
-- list) until they do.
alter table submissions add column feedback_ack_required boolean not null default false;
