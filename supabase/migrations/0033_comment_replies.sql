-- A back-and-forth conversation layered on top of the existing single
-- teacher_comments field, which stays exactly as it is (the original/primary
-- comment, still edited the same way in the grading UI). Each entry is
-- { author: 'teacher' | 'student', text, at }, oldest first.
alter table submissions add column comment_replies jsonb not null default '[]';
