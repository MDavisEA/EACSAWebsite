-- Seed data: the Password Generator problem used as the worked example
-- in MIGRATION_GUIDE.md. Run this in the Supabase SQL editor after the
-- 0001_init.sql migration, or skip it and create your own problems through
-- the teacher UI once the test-case editor exists.

insert into coding_problems (
  title, description_html, language, class_name, starter_code,
  harness_type, method_name, method_arg_types, trial_count, test_cases,
  points_possible, is_active
) values (
  'CREATE: Password Generator',
  '<p>Dictator Davis is attempting to create an uncrackable password. Help him generate one using the given character string. You MUST use <code>charAt</code> to pull characters one at a time - no shortcuts.</p><p><code>String s = "abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&amp;*()`~&lt;&gt;,.;'':[]{}/|_+-=?";</code></p><p>Write <code>public static String generatePassword()</code> in a class called <code>Solution</code>. It must return a password that is at least 8 characters long and contains at least one uppercase letter, one lowercase letter, one digit, and one special character.</p>',
  'java',
  'Solution',
  'public class Solution {

    private static final String CHARS =
        "abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()`~<>,.;'':[]{}/|_+-=?";

    public static String generatePassword() {
        // TODO: Use charAt to pull characters one at a time.
        // Use IndexOf to find the start/end of the letters, numbers,
        // and special-character sections of CHARS first.

        String password = "";

        return password;
    }

    // You can still have a main() here to test interactively in Eclipse -
    // it''s ignored by the autograder, which only calls generatePassword() directly.
    public static void main(String[] args) {
        System.out.println(generatePassword());
    }
}',
  'property_check',
  'generatePassword',
  '[]'::jsonb,
  30,
  '[{"id": "min8", "label": "Password is at least 8 characters long", "hidden": false, "points": 1, "check_kind": "min_length", "param": 8}, {"id": "has_upper", "label": "Contains at least one uppercase letter", "hidden": false, "points": 1, "check_kind": "contains_upper"}, {"id": "has_lower", "label": "Contains at least one lowercase letter", "hidden": false, "points": 1, "check_kind": "contains_lower"}, {"id": "has_digit", "label": "Contains at least one digit", "hidden": false, "points": 1, "check_kind": "contains_digit"}, {"id": "has_special", "label": "Contains at least one special character", "hidden": false, "points": 1, "check_kind": "contains_special"}, {"id": "no_hardcode", "label": "Hidden check", "hidden": true, "points": 4, "check_kind": "trial_variety", "param": 80}]'::jsonb,
  9,
  true
);
