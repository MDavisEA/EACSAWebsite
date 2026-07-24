-- Coding problems can now test multiple methods per submission (e.g. a
-- 3-method assignment), each with its own check type and test cases.
-- Everything that used to live directly on coding_problems (harness_type,
-- method_name, method_arg_types, trial_count, test_cases) moves into a
-- `methods` array, one entry per method. Existing rows are migrated in
-- place rather than requiring a rewrite.

alter table coding_problems add column methods jsonb not null default '[]'::jsonb;

update coding_problems
set methods = jsonb_build_array(
  jsonb_build_object(
    'method_name', method_name,
    'harness_type', harness_type,
    'method_arg_types', method_arg_types,
    'trial_count', trial_count,
    'test_cases', test_cases
  )
)
where method_name is not null;

alter table coding_problems drop column harness_type;
alter table coding_problems drop column method_name;
alter table coding_problems drop column method_arg_types;
alter table coding_problems drop column trial_count;
alter table coding_problems drop column test_cases;
