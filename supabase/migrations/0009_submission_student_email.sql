-- Roster matching needs a reliable key. Google sign-in gives us the student's
-- school email, which is exact - matching on display name alone breaks as soon
-- as Google says "Matthew Davis" and the roster says "Matt Davis". Populated
-- from the verified JWT at submit time, so it is never client-supplied.
-- Nullable: bulk-imported rows and pre-existing submissions have no email, and
-- those fall back to name matching.
alter table submissions add column student_email text;

create index submissions_student_email_idx on submissions(lower(student_email));
