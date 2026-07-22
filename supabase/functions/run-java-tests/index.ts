import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/teacherAuth.ts';

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
}

interface CodingProblem {
  id: string;
  class_name: string;
  harness_type: 'exact_match' | 'property_check';
  method_name: string;
  method_arg_types: string[];
  trial_count?: number;
  test_cases: TestCase[];
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

function buildDriver(problem: CodingProblem): string {
  const { class_name, harness_type, method_name, method_arg_types = [], trial_count = 30 } = problem;

  if (harness_type === 'property_check') {
    return `
public class Main {
  public static void main(String[] args) {
    int trials = ${trial_count};
    for (int i = 0; i < trials; i++) {
      Object result = ${class_name}.${method_name}();
      System.out.println("__TRIAL__:" + String.valueOf(result));
    }
  }
}`.trim();
  }

  const calls = problem.test_cases
    .filter((tc) => tc.check_kind === 'exact_output')
    .map((tc, idx) => {
      const args = (tc.method_args || []).map((val, i) => {
        const t = method_arg_types[i];
        if (t === 'String') return JSON.stringify(String(val));
        return String(val);
      });
      return `
    try {
      Object r${idx} = ${class_name}.${method_name}(${args.join(', ')});
      System.out.println("__RESULT__:${tc.id}:" + String.valueOf(r${idx}));
    } catch (Exception e) {
      System.out.println("__ERROR__:${tc.id}:" + e.toString());
    }`;
    })
    .join('\n');

  return `
public class Main {
  public static void main(String[] args) {
${calls}
  }
}`.trim();
}

function evaluateProperty(tc: TestCase, trials: string[]): { passed: boolean; detail: string } {
  const check = (pred: (s: string) => boolean, failMsg: string) => {
    const failing = trials.find((t) => !pred(t));
    return failing === undefined
      ? { passed: true, detail: 'Held across all trials' }
      : { passed: false, detail: `${failMsg} (e.g. saw "${failing}")` };
  };

  switch (tc.check_kind) {
    case 'min_length':
      return check((s) => s.length >= (tc.param ?? 0), `Expected length >= ${tc.param}`);
    case 'max_length':
      return check((s) => s.length <= (tc.param ?? Infinity), `Expected length <= ${tc.param}`);
    case 'contains_upper':
      return check((s) => /[A-Z]/.test(s), 'Expected at least one uppercase letter');
    case 'contains_lower':
      return check((s) => /[a-z]/.test(s), 'Expected at least one lowercase letter');
    case 'contains_digit':
      return check((s) => /[0-9]/.test(s), 'Expected at least one digit');
    case 'contains_special':
      return check((s) => /[!@#$%^&*()`~<>,.;:'\[\]{}\/|_+\-=?]/.test(s), 'Expected at least one special character');
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
      return check((s) => !hasRun(s), `Expected no run of the same character longer than ${limit}`);
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
    const { data: submission, error: subErr } = await admin
      .from('submissions')
      .select('*')
      .eq('id', submission_id)
      .maybeSingle();
    if (subErr || !submission || submission.session_token !== session_token) {
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

    const driverSource = buildDriver(problem);
    const combinedSource = `${driverSource}\n\n${stripPublicModifier(code, problem.class_name)}`;

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
      (l) => l.startsWith('__TRIAL__:') || l.startsWith('__RESULT__:') || l.startsWith('__ERROR__:')
    );
    const compileError: string | undefined =
      runResult?.compile?.stderr ||
      (runResult?.run?.code !== 0 && producedNoOutput
        ? runResult?.run?.stderr || 'The program did not compile or run.'
        : undefined);

    if (compileError) {
      await admin
        .from('submissions')
        .update({ code, compile_error: compileError, test_results: [] })
        .eq('id', submission_id);
      return json({ compile_error: compileError, test_results: [] });
    }

    const results: {
      test_id: string;
      label: string;
      hidden: boolean;
      passed: boolean;
      points_earned: number;
      points_possible: number;
      detail: string;
    }[] = [];

    if (problem.harness_type === 'property_check') {
      const trials = lines.filter((l) => l.startsWith('__TRIAL__:')).map((l) => l.slice('__TRIAL__:'.length));
      for (const tc of problem.test_cases) {
        const { passed, detail } = evaluateProperty(tc, trials);
        results.push({
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
      const resultMap: Record<string, string> = {};
      for (const l of lines) {
        const m = l.match(/^__RESULT__:([^:]+):(.*)$/) || l.match(/^__ERROR__:([^:]+):(.*)$/);
        if (m) resultMap[m[1]] = m[2];
      }
      for (const tc of problem.test_cases) {
        const actual = resultMap[tc.id];
        const passed = actual !== undefined && actual === String(tc.expected_output);
        results.push({
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

    const tests_passed = results.filter((r) => r.passed).length;
    const autograde_score = results.reduce((sum, r) => sum + r.points_earned, 0);

    const historyEntry = {
      timestamp: new Date().toISOString(),
      final: !!final,
      tests_passed,
      tests_total: results.length,
    };
    const run_history = [...(submission.run_history || []), historyEntry];

    const update: Record<string, unknown> = {
      code,
      test_results: results,
      run_history,
      compile_error: '',
    };
    if (final) {
      update.autograde_score = autograde_score;
    }
    await admin.from('submissions').update(update).eq('id', submission_id);

    return json({
      test_results: results.map((r) => (r.hidden ? { ...r, detail: r.passed ? 'Passed' : 'Failed' } : r)),
      tests_passed,
      tests_total: results.length,
      autograde_score,
    });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
