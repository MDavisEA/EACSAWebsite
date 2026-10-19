-- A sketch assignment can also ask written questions (text answers beside the
-- programs - "explain what draw does"). `questions` is the teacher's list:
--   [{ "id": "q_x7k2", "prompt": "What does setup do?", "points": 2, "code": false }, ...]
-- Empty (the default, and every existing project) means no written part.
--
-- A student's answers live in submissions.answers as { "<question id>": "text" }.
-- The teacher's per-question scores go in submissions.question_scores under the
-- same ids, next to the per-program scores (ids never collide: the projects
-- function keeps them apart), and are withheld until release like the rest.
alter table projects add column questions jsonb not null default '[]'::jsonb;
alter table submissions add column answers jsonb not null default '{}'::jsonb;
