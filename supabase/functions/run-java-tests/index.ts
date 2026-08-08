import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/teacherAuth.ts';
import { getStudentFromRequest } from '../_shared/studentAuth.ts';

const PISTON_URL = 'https://emkc.org/api/v2/piston/execute';

interface TestCase {
  id: string;
  label: string;
  hidden?: boolean;
  points: number;
  check_kind: string;
  method_args?: unknown[];
  expected_output?: string;
  param?: number;
  // program_output only: what gets typed into stdin, and whether the
  // "must contain" comparison ignores capitalization.
  stdin?: string;
  ignore_case?: boolean;
}

interface Method {
  // For program_output this is a display/grouping label rather than a real
  // Java method name - results are keyed by it either way.
  method_name: string;
  harness_type: 'exact_match' | 'property_check' | 'program_output';
  method_arg_types: string[];
  trial_count?: number;
  test_cases: TestCase[];
}

interface CodingProblem {
  id: string;
  class_name: string;
  methods: Method[];
  // How many practice runs a student gets. null = unlimited.
  max_test_runs?: number | null;
}

// Piston's Java package doesn't run javac on multiple files - it renames
// the single uploaded file to <name>.java and runs `java <name>.java`
// (JEP 330 single-file source-launch), which only sees one compilation
// unit. So the driver and the student's class have to live in the same
// file. Only one top-level type per file may be `public`, so the
// student's class loses that modifier here (a package-private class is
// still fully visible to Main in the same file).
function stripPublicModifier(code: string, className: string): string {
  const re = new RegExp(`public\\s+((?:final\\s+|abstract\\s+|strictfp\\s+)*)class(\\s+${className}\\b)`);
  return code.replace(re, (_m, modifiers, rest) => `${modifiers}class${rest}`);
}

// Java requires every import to appear before the first type declaration. The
// driver class is concatenated ahead of the student's code, so a student
// writing `import java.util.Scanner;` (or ArrayList, HashMap, ...) would put
// an import after a class and fail to compile - through no fault of their own,
// with an error pointing at their import line. Pull the imports out and float
// them to the very top of the combined file.
//
// `package` declarations are dropped entirely: Piston compiles one loose file,
// and a package statement would put the student's class somewhere the driver
// cannot name.
function hoistImportsAndStripPackage(code: string): { imports: string[]; body: string } {
  const importRe = /^[ \t]*import[ \t]+(?:static[ \t]+)?[\w.*]+[ \t]*;[ \t]*$/gm;
  const packageRe = /^[ \t]*package[ \t]+[\w.]+[ \t]*;[ \t]*$/gm;

  const imports = [...new Set((code.match(importRe) || []).map((l) => l.trim()))];
  const body = code.replace(importRe, '').replace(packageRe, '');
  return { imports, body };
}

// One problem can test several methods (e.g. a 3-method assignment). Each
// method's driver code is wrapped in its own block (braces) so local
// variable names never collide across methods even though everything
// ends up concatenated into one main(). Every marker line is tagged with
// the method name so results can be attributed back to the right method.
// Escapes a string for embedding in Java source as a double-quoted literal.
function javaStringLiteral(s: string): string {
  return JSON.stringify(String(s ?? ''));
}

function buildMethodDriver(className: string, method: Method): string {
  const { method_name, harness_type, method_arg_types = [], trial_count = 30, test_cases } = method;

  // Runs the student's whole program once per test case: feeds the test's
  // input to stdin, runs main(), and captures everything it printed.
  //
  // Two details that matter:
  //  - Output is captured into a buffer and emitted Base64-encoded on ONE
  //    line. Printing it raw would interleave multi-line student output with
  //    the __MARKER__ lines the grader parses, and a student printing
  //    something marker-shaped could forge a result.
  //  - System.out/System.in are restored in a finally, so one test blowing up
  //    cannot swallow the output of the tests after it.
  if (harness_type === 'program_output') {
    const runs = test_cases
      .map((tc, idx) => {
        const stdinLiteral = javaStringLiteral(tc.stdin ?? '');
        return `
    {
      java.io.ByteArrayOutputStream __buf${idx} = new java.io.ByteArrayOutputStream();
      java.io.PrintStream __origOut${idx} = System.out;
      java.io.InputStream __origIn${idx} = System.in;
      try {
        System.setIn(new java.io.ByteArrayInputStream(${stdinLiteral}.getBytes("UTF-8")));
        System.setOut(new java.io.PrintStream(__buf${idx}, true, "UTF-8"));
        ${className}.main(new String[]{});
      } catch (Throwable __t${idx}) {
        System.setOut(__origOut${idx});
        System.setIn(__origIn${idx});
        System.out.println("__ERROR__:${method_name}:${tc.id}:" + __t${idx}.toString());
      } finally {
        System.setOut(__origOut${idx});
        System.setIn(__origIn${idx});
      }
      System.out.println("__OUTB64__:${method_name}:${tc.id}:"
        + java.util.Base64.getEncoder().encodeToString(__buf${idx}.toByteArray()));
    }`;
      })
      .join('\n');
    return `
    {
${runs}
    }`;
  }

  if (harness_type === 'property_check') {
    return `
    {
      int trials = ${trial_count};
      for (int i = 0; i < trials; i++) {
        Object result = ${className}.${method_name}();
        System.out.println("__TRIAL__:${method_name}:" + String.valueOf(result));
      }
    }`;
  }

  const calls = test_cases
    .filter((tc) => tc.check_kind === 'exact_output')
    .map((tc, idx) => {
      const args = (tc.method_args || []).map((val, i) => {
        const t = method_arg_types[i];
        if (t === 'String') return JSON.stringify(String(val));
        return String(val);
      });
      return `
    try {
      Object r${idx} = ${className}.${method_name}(${args.join(', ')});
      System.out.println("__RESULT__:${method_name}:${tc.id}:" + String.valueOf(r${idx}));
    } catch (Exception e) {
      System.out.println("__ERROR__:${method_name}:${tc.id}:" + e.toString());
    }`;
    })
    .join('\n');

  return `
    {
${calls}
    }`;
}

function buildDriver(problem: CodingProblem): string {
  const blocks = problem.methods.map((m) => buildMethodDriver(problem.class_name, m)).join('\n');
  return `
public class Main {
  public static void main(String[] args) {
${blocks}
  }
}`.trim();
}

function evaluateProperty(tc: TestCase, trials: string[]): { passed: boolean; detail: string } {
  const check = (pred: (s: string) => boolean, passMsg: string, failMsg: string) => {
    const failing = trials.find((t) => !pred(t));
    return failing === undefined
      ? { passed: true, detail: passMsg }
      : { passed: false, detail: `${failMsg} (e.g. saw "${failing}")` };
  };

  switch (tc.check_kind) {
    case 'min_length':
      return check(
        (s) => s.length >= (tc.param ?? 0),
        `Length was always >= ${tc.param}`,
        `Expected length >= ${tc.param}`
      );
    case 'max_length':
      return check(
        (s) => s.length <= (tc.param ?? Infinity),
        `Length was always <= ${tc.param}`,
        `Expected length <= ${tc.param}`
      );
    case 'contains_upper':
      return check((s) => /[A-Z]/.test(s), 'Every trial had an uppercase letter', 'Expected at least one uppercase letter');
    case 'contains_lower':
      return check((s) => /[a-z]/.test(s), 'Every trial had a lowercase letter', 'Expected at least one lowercase letter');
    case 'contains_digit':
      return check((s) => /[0-9]/.test(s), 'Every trial had a digit', 'Expected at least one digit');
    case 'contains_special':
      return check(
        (s) => /[!@#$%^&*()`~<>,.;:'\[\]{}\/|_+\-=?]/.test(s),
        'Every trial had a special character',
        'Expected at least one special character'
      );
    case 'no_repeated_chars_over': {
      const limit = tc.param ?? Infinity;
      const hasRun = (s: string) => {
        let run = 1;
        for (let i = 1; i < s.length; i++) {
          run = s[i] === s[i - 1] ? run + 1 : 1;
          if (run > limit) return true;
        }
        return false;
      };
      return check(
        (s) => !hasRun(s),
        `No run of the same character longer than ${limit}`,
        `Expected no run of the same character longer than ${limit}`
      );
    }
    case 'trial_variety': {
      const minUniqueFraction = (tc.param ?? 80) / 100;
      const uniqueCount = new Set(trials).size;
      const fraction = trials.length > 0 ? uniqueCount / trials.length : 0;
      return fraction >= minUniqueFraction
        ? { passed: true, detail: `${uniqueCount}/${trials.length} trials were unique` }
        : {
            passed: false,
            detail: `Only ${uniqueCount}/${trials.length} trials were unique - looks hardcoded or not random enough`,
          };
    }
    default:
      return { passed: false, detail: 'Unknown check_kind for property_check harness' };
  }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = createAdminClient();
    const { submission_id, session_token, coding_problem_id, code, final } = await req.json();

    if (!submission_id || !session_token || !coding_problem_id || typeof code !== 'string') {
      return json(
        { error: 'submission_id, session_token, coding_problem_id, and code are all required' },
        400
      );
    }

    // Ownership check - this was missing in the first (Base44) version of this
    // function. Without it, anyone who knew a submission_id could run code
    // "as" that submission and overwrite someone else's autograde history.
    // Two ownership models coexist here, same as submissions/index.ts:
    // student_user_id (Google-signed-in students) takes precedence when set,
    // else fall back to the legacy session_token check.
    const student = await getStudentFromRequest(req, admin);
    const { data: submission, error: subErr } = await admin
      .from('submissions')
      .select('*')
      .eq('id', submission_id)
      .maybeSingle();
    if (subErr || !submission) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const owned = submission.student_user_id
      ? !!student && submission.student_user_id === student.id
      : submission.session_token === session_token;
    if (!owned) {
      return json({ error: 'Unauthorized' }, 401);
    }
    if (submission.submitted) {
      return json({ error: 'This submission has already been finalized' }, 409);
    }

    const { data: problems, error: probErr } = await admin
      .from('coding_problems')
      .select('*')
      .eq('id', coding_problem_id)
      .maybeSingle();
    if (probErr || !problems) return json({ error: 'CodingProblem not found' }, 404);
    const problem = problems as CodingProblem;

    // Practice runs are capped so the visible test cases can't just be
    // brute-forced. Enforced here rather than only by disabling the button,
    // because the button is trivially bypassed by calling this endpoint
    // directly. Only non-final runs count: a student who has used every
    // practice run must still be able to turn the work in, or the cap would
    // stop them submitting at all.
    if (!final && problem.max_test_runs !== null && problem.max_test_runs !== undefined) {
      const used = (submission.run_history || []).filter(
        (h: Record<string, any>) => !h.final
      ).length;
      if (used >= problem.max_test_runs) {
        return json(
          {
            error: `You have used all ${problem.max_test_runs} test runs for this problem. You can still submit your work when you are ready.`,
            runs_used: used,
            max_test_runs: problem.max_test_runs,
          },
          429
        );
      }
    }

    const driverSource = buildDriver(problem);
    const { imports, body } = hoistImportsAndStripPackage(code);
    const importBlock = imports.length > 0 ? `${imports.join('\n')}\n\n` : '';
    const combinedSource = `${importBlock}${driverSource}\n\n${stripPublicModifier(body, problem.class_name)}`;

    const pistonHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    const pistonApiKey = Deno.env.get('PISTON_API_KEY');
    if (pistonApiKey) pistonHeaders['Authorization'] = pistonApiKey;

    const pistonResp = await fetch(PISTON_URL, {
      method: 'POST',
      headers: pistonHeaders,
      body: JSON.stringify({
        language: 'java',
        version: '*',
        files: [{ name: 'Main', content: combinedSource }],
      }),
    });

    if (!pistonResp.ok) {
      return json({ error: `Execution service error: ${pistonResp.status}` }, 502);
    }

    const runResult = await pistonResp.json();
    const stdout: string = runResult?.run?.stdout || '';
    const lines = stdout.split('\n').map((l: string) => l.trim()).filter(Boolean);

    // This Piston Java package has no separate compile phase - it runs
    // `java Main.java` directly (single-file source-launch), which
    // compiles and executes in one step. So runResult.compile never
    // exists, and a syntax error just looks like a run that produced no
    // trial/result markers. Without this check, an empty trials array
    // vacuously "passes" every property_check test (see evaluateProperty).
    const producedNoOutput = !lines.some(
      (l) =>
        l.startsWith('__TRIAL__:') ||
        l.startsWith('__RESULT__:') ||
        l.startsWith('__ERROR__:') ||
        // program_output tests emit only this marker on a clean run, so
        // leaving it out here would report every passing whole-program
        // submission as a compile error.
        l.startsWith('__OUTB64__:')
    );
    const compileError: string | undefined =
      runResult?.compile?.stderr ||
      (runResult?.run?.code !== 0 && producedNoOutput
        ? runResult?.run?.stderr || 'The program did not compile or run.'
        : undefined);

    if (compileError) {
      // Every attempt gets recorded here - not just successful runs - so
      // a teacher reviewing a student's process can see syntax struggles
      // (compile errors) as distinct from logic struggles (ran but failed
      // checks), not just silence between the first and last attempt.
      const historyEntry = {
        timestamp: new Date().toISOString(),
        final: !!final,
        code,
        compile_error: compileError,
        tests_passed: 0,
        tests_total: 0,
        results: [],
      };
      const run_history = [...(submission.run_history || []), historyEntry];
      await admin
        .from('submissions')
        .update({ code, compile_error: compileError, test_results: [], run_history })
        .eq('id', submission_id);
      return json({
        compile_error: compileError,
        test_results: [],
        runs_used: run_history.filter((h: Record<string, any>) => !h.final).length,
        max_test_runs: problem.max_test_runs ?? null,
      });
    }

    const results: {
      method_name: string;
      test_id: string;
      label: string;
      hidden: boolean;
      passed: boolean;
      points_earned: number;
      points_possible: number;
      detail: string;
    }[] = [];

    for (const method of problem.methods) {
      const { method_name, harness_type, test_cases } = method;

      if (harness_type === 'program_output') {
        for (const tc of test_cases) {
          const outPrefix = `__OUTB64__:${method_name}:${tc.id}:`;
          const errPrefix = `__ERROR__:${method_name}:${tc.id}:`;
          const outLine = lines.find((l) => l.startsWith(outPrefix));
          const errLine = lines.find((l) => l.startsWith(errPrefix));

          let output = '';
          if (outLine) {
            try {
              output = new TextDecoder().decode(
                Uint8Array.from(atob(outLine.slice(outPrefix.length)), (c) => c.charCodeAt(0))
              );
            } catch {
              output = '';
            }
          }

          const expected = String(tc.expected_output ?? '');
          const haystack = tc.ignore_case ? output.toLowerCase() : output;
          const needle = tc.ignore_case ? expected.toLowerCase() : expected;
          // Deliberately a substring check, not equality: the teacher is
          // checking that the right answer appears, and students are free to
          // word the surrounding text however they like.
          const passed = expected !== '' && haystack.includes(needle);

          let detail: string;
          if (errLine) {
            const crashed = errLine.slice(errPrefix.length);
            detail = `Program crashed: ${crashed}`;
          } else if (!outLine) {
            detail = 'The program did not run for this test.';
          } else if (passed) {
            detail = `Found "${expected}" in the output`;
          } else if (output.trim() === '') {
            detail = `Expected the output to contain "${expected}", but the program printed nothing`;
          } else {
            const shown = output.trim().length > 300 ? output.trim().slice(0, 300) + '…' : output.trim();
            detail = `Expected the output to contain "${expected}", but got: ${shown}`;
          }

          results.push({
            method_name,
            test_id: tc.id,
            label: tc.hidden ? 'Hidden test' : tc.label,
            hidden: !!tc.hidden,
            passed,
            points_earned: passed ? tc.points : 0,
            points_possible: tc.points,
            // A hidden test must not reveal the expected answer, the input, or
            // the student's own output for that input.
            detail: tc.hidden ? (passed ? 'Passed' : 'Failed') : detail,
          });
        }
      } else if (harness_type === 'property_check') {
        const prefix = `__TRIAL__:${method_name}:`;
        const trials = lines.filter((l) => l.startsWith(prefix)).map((l) => l.slice(prefix.length));
        for (const tc of test_cases) {
          const { passed, detail } = evaluateProperty(tc, trials);
          results.push({
            method_name,
            test_id: tc.id,
            label: tc.hidden ? 'Hidden test' : tc.label,
            hidden: !!tc.hidden,
            passed,
            points_earned: passed ? tc.points : 0,
            points_possible: tc.points,
            detail: tc.hidden ? (passed ? 'Passed' : 'Failed') : detail,
          });
        }
      } else {
        for (const tc of test_cases) {
          const resultPrefix = `__RESULT__:${method_name}:${tc.id}:`;
          const errorPrefix = `__ERROR__:${method_name}:${tc.id}:`;
          const matchLine = lines.find((l) => l.startsWith(resultPrefix) || l.startsWith(errorPrefix));
          const actual = matchLine
            ? matchLine.startsWith(resultPrefix)
              ? matchLine.slice(resultPrefix.length)
              : matchLine.slice(errorPrefix.length)
            : undefined;
          const passed = actual !== undefined && actual === String(tc.expected_output);
          results.push({
            method_name,
            test_id: tc.id,
            label: tc.hidden ? 'Hidden test' : tc.label,
            hidden: !!tc.hidden,
            passed,
            points_earned: passed ? tc.points : 0,
            points_possible: tc.points,
            detail: tc.hidden
              ? passed
                ? 'Passed'
                : 'Failed'
              : `Expected "${tc.expected_output}", got "${actual ?? '(no output)'}"`,
          });
        }
      }
    }

    const tests_passed = results.filter((r) => r.passed).length;
    const autograde_score = results.reduce((sum, r) => sum + r.points_earned, 0);

    // A full code snapshot and per-check breakdown per attempt - not just
    // the aggregate pass count - so a teacher can see exactly which check
    // a student was stuck on and how their code changed between tries.
    const historyEntry = {
      timestamp: new Date().toISOString(),
      final: !!final,
      code,
      compile_error: null,
      tests_passed,
      tests_total: results.length,
      results,
    };
    const run_history = [...(submission.run_history || []), historyEntry];

    const update: Record<string, unknown> = {
      code,
      test_results: results,
      run_history,
      compile_error: '',
    };
    if (final) {
      // Finalize in this same write rather than requiring the client to
      // make a second, separate call to lock the submission - that gap
      // between two round-trips is exactly the window where an
      // interrupted request could grade a submission successfully but
      // never mark it submitted.
      update.autograde_score = autograde_score;
      update.submitted = true;
      update.submitted_at = new Date().toISOString();
    }
    await admin.from('submissions').update(update).eq('id', submission_id);

    return json({
      test_results: results.map((r) => (r.hidden ? { ...r, detail: r.passed ? 'Passed' : 'Failed' } : r)),
      tests_passed,
      tests_total: results.length,
      autograde_score,
      runs_used: run_history.filter((h: Record<string, any>) => !h.final).length,
      max_test_runs: problem.max_test_runs ?? null,
    });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
