import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest, teacherOwnsRow } from '../_shared/teacherAuth.ts';
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
  // output_number_relation only: require the number after relation_b to equal
  // the number after relation_a, combined with relation_value. Lets a program
  // whose numbers are random still be checked for doing the right arithmetic.
  relation_a?: string;
  relation_b?: string;
  relation_op?: 'times' | 'divided' | 'plus' | 'minus';
  relation_value?: string;
  // output_repeat_count only: how many times expected_output must appear.
  // Checks that a loop ran the right number of times.
  count_op?: 'exactly' | 'at_least' | 'at_most';
  count_value?: string | number;
  // Teacher-written note shown to the student only when this check fails -
  // a nudge toward the mistake rather than the answer.
  fail_message?: string;
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

// Java's single-file source-launch (`java Foo.java`) enforces the ordinary
// javac rule that a PUBLIC top-level class's name must match the file it is
// in - it just does the check in memory instead of on disk. Piston's `name`
// field is that filename, so running a plain submission under a fixed name
// like "Main" only compiles for the one student who happened to call their
// class Main; everyone else gets "class X is public, should be declared in a
// file named X.java" for a program that is otherwise completely correct.
// Reading the student's own class name and naming the file after it is what
// makes this harness-free case (no method name, no fixed class_name to
// enforce) actually independent of what they called anything. A submission
// with no public class has no such constraint - Java just runs the first
// declared class - so any placeholder name works.
function extractPublicClassName(code: string): string | null {
  const m = code.match(/public\s+(?:final\s+|abstract\s+|strictfp\s+)*class\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
  return m ? m[1] : null;
}

// Autograded problems inject a driver that calls the student's class by name
// (`${className}.method(...)`, `${className}.main(...)`) - so that name has
// to be whatever the student actually called their class, not the value the
// teacher typed into the problem's Class Name field. Otherwise a student who
// renamed their class, or just didn't notice the field, would fail every
// check through no fault in their actual logic - the exact same class of bug
// extractPublicClassName exists to fix for the hand-graded runPlain path.
// Falls back to any top-level class if none is public (Java requires exactly
// one public class per file, but a solo package-private class is common and
// perfectly valid), and only falls back to the teacher's own class_name as a
// last resort for code with no discernible class at all - which will fail to
// compile no matter what name is picked.
function extractStudentClassName(code: string): string | null {
  return extractPublicClassName(code) ?? (code.match(/\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)/)?.[1] ?? null);
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

// Comparing money as text punishes students for formatting rather than for
// being wrong: `System.out.println(total)` prints 79.8 where printf prints
// 79.80, and both are the correct answer. A "contains this number" check is
// compared numerically instead, so 1500, 1500.0, 1500.00 and $1,500.00 are
// all the same value. The matching itself runs in the generated Java (see
// buildMethodDriver); this only parses what the teacher typed. Strips
// currency symbols and thousands separators, keeps a leading minus.
function parseLooseNumber(raw: string): number | null {
  const cleaned = String(raw ?? '').replace(/[$\s,]/g, '');
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function javaStringLiteral(s: string): string {
  return JSON.stringify(String(s ?? ''));
}

// One problem can test several methods. Each method's driver code is wrapped
// in its own block so local variable names never collide even though it all
// ends up concatenated into one main(). Every marker line is tagged with the
// method name so results can be attributed back to the right method.
function buildMethodDriver(className: string, method: Method): string {
  const { method_name, harness_type, method_arg_types = [], trial_count = 30, test_cases } = method;

  // Runs the student's whole program with the test's input on stdin and
  // captures what it printed. System.out/System.in are restored in a finally,
  // so a program that blows up cannot swallow the runs after it.
  if (harness_type === 'program_output') {
    // Checks are grouped by the input they feed in, and each distinct input
    // runs the student's program exactly ONCE. Running it per check instead
    // got the whole submission SIGKILLed by the sandbox on a program that
    // prints a banner and a few rounds of output - and in the usual case a
    // teacher asks several questions about the same run anyway (feed it one
    // purchase, then check the subtotal, the tax and the total), so this is
    // both cheaper and closer to how the checks are actually written.
    const groups = new Map<string, TestCase[]>();
    for (const tc of test_cases) {
      const key = String(tc.stdin ?? '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(tc);
    }

    const runs = [...groups.entries()]
      .map(([stdin, cases], g) => {
        const stdinLiteral = javaStringLiteral(stdin);

        // Each check is decided HERE, in Java, against the captured text.
        // Only a verdict and a short excerpt cross back, so a chatty program
        // cannot overrun the runner's output limit.
        const checks = cases
          .map((tc, i) => {
            const expected = String(tc.expected_output ?? '');
            const asNumber = tc.check_kind === 'output_contains_number';
            const target = asNumber ? parseLooseNumber(expected) : null;
            const v = `${g}_${i}`;

            // "math that checks out": pull every number that follows label A
            // and every number that follows label B, pair them up in order,
            // and require b = a <op> value for each pair. This is what makes a
            // program with random numbers gradeable - the values differ every
            // run, but the relationship between them must not. Also fails a
            // student who prints a plausible total without computing it, since
            // then the pair counts or the arithmetic won't line up.
            const isRelation = tc.check_kind === 'output_number_relation';
            const relValue = isRelation ? parseLooseNumber(String(tc.relation_value ?? '')) : null;
            const relOk =
              isRelation && relValue !== null && String(tc.relation_a ?? '') && String(tc.relation_b ?? '');
            const opExpr =
              tc.relation_op === 'divided'
                ? `__a${v} / ${relValue}`
                : tc.relation_op === 'plus'
                ? `__a${v} + ${relValue}`
                : tc.relation_op === 'minus'
                ? `__a${v} - ${relValue}`
                : `__a${v} * ${relValue}`;

            // Counting occurrences: the direct way to ask "did the loop run
            // the right number of times". The count is reported back so a
            // failure can say what it actually found, which is the difference
            // between "your loop is wrong" and "your loop ran 1 time, not 5".
            const isCount = tc.check_kind === 'output_repeat_count';
            const countTarget = isCount ? parseLooseNumber(String(tc.count_value ?? '')) : null;
            const countCmp =
              tc.count_op === 'at_least' ? '>=' : tc.count_op === 'at_most' ? '<=' : '==';

            const evaluate = isCount
              ? countTarget === null || expected === ''
                ? `boolean __ok${v} = false; int __n${v} = 0;`
                : `int __n${v} = 0;
      {
        String __hay${v} = ${tc.ignore_case ? `__text${g}.toLowerCase()` : `__text${g}`};
        String __ndl${v} = ${javaStringLiteral(tc.ignore_case ? expected.toLowerCase() : expected)};
        int __from${v} = 0;
        while (true) {
          int __at${v} = __hay${v}.indexOf(__ndl${v}, __from${v});
          if (__at${v} < 0) break;
          __n${v}++;
          __from${v} = __at${v} + __ndl${v}.length();
        }
      }
      boolean __ok${v} = __n${v} ${countCmp} ${countTarget};`
              : isRelation
              ? !relOk
                ? `boolean __ok${v} = false;`
                : `boolean __ok${v} = false;
      {
        java.util.List<Double> __as${v} = __numsAfter(__text${g}, ${javaStringLiteral(
                    String(tc.relation_a)
                  )});
        java.util.List<Double> __bs${v} = __numsAfter(__text${g}, ${javaStringLiteral(
                    String(tc.relation_b)
                  )});
        if (!__as${v}.isEmpty() && __as${v}.size() == __bs${v}.size()) {
          __ok${v} = true;
          for (int __i${v} = 0; __i${v} < __as${v}.size(); __i${v}++) {
            double __a${v} = __as${v}.get(__i${v});
            double __b${v} = __bs${v}.get(__i${v});
            // A cent of slack: students round money in different ways, and
            // failing them for 11.969999999999999 vs 11.97 would be noise.
            if (Math.abs(__b${v} - (${opExpr})) > 0.011) { __ok${v} = false; break; }
          }
        }
      }`
              : asNumber && target !== null
                ? `boolean __ok${v} = false;
      java.util.regex.Matcher __m${v} = java.util.regex.Pattern
        .compile("-?\\\\$?\\\\d[\\\\d,]*(?:\\\\.\\\\d+)?").matcher(__text${g});
      while (__m${v}.find()) {
        try {
          if (Math.abs(Double.parseDouble(__m${v}.group().replaceAll("[$,]", "")) - ${target}) <= 0.005) {
            __ok${v} = true; break;
          }
        } catch (Exception __ignored${v}) { }
      }`
                : asNumber || expected === ''
                ? `boolean __ok${v} = false;`
                : tc.ignore_case
                ? `boolean __ok${v} = __text${g}.toLowerCase().contains(${javaStringLiteral(
                    expected.toLowerCase()
                  )});`
                : `boolean __ok${v} = __text${g}.contains(${javaStringLiteral(expected)});`;

            return `      ${evaluate}
      System.out.println("__CHK__:${method_name}:${tc.id}:" + (__ok${v} ? "1" : "0")${
              isCount ? ` + ":" + __n${v}` : ''
            });`;
          })
          .join('\n');

        return `
    {
      java.io.ByteArrayOutputStream __buf${g} = new java.io.ByteArrayOutputStream();
      java.io.PrintStream __origOut${g} = System.out;
      java.io.InputStream __origIn${g} = System.in;
      boolean __crashed${g} = false;
      String __err${g} = "";
      try {
        System.setIn(new java.io.ByteArrayInputStream(${stdinLiteral}.getBytes("UTF-8")));
        System.setOut(new java.io.PrintStream(__buf${g}, true, "UTF-8"));
        ${className}.main(new String[]{});
      } catch (Throwable __t${g}) {
        __crashed${g} = true;
        __err${g} = __t${g}.toString();
      } finally {
        System.setOut(__origOut${g});
        System.setIn(__origIn${g});
      }
      String __text${g} = new String(__buf${g}.toByteArray(), java.nio.charset.StandardCharsets.UTF_8);
${checks}
      // Excerpt and crash report are emitted ONCE per run, not per check.
      // This runner truncates stdout at roughly 1KB, and repeating a Base64
      // excerpt on every check silently cut off the last check's verdict -
      // which surfaced as "the program did not run for this test".
      String __excerpt${g} = __text${g}.length() > 160
        ? __text${g}.substring(0, 160) + "\\u2026" : __text${g};
      System.out.println("__EXC__:${method_name}:${g}:"
        + java.util.Base64.getEncoder().encodeToString(
            __excerpt${g}.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
      if (__crashed${g}) {
        System.out.println("__ERROR__:${method_name}:${g}:" + __err${g});
      }
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

function buildDriver(problem: CodingProblem, className: string): string {
  const blocks = problem.methods.map((m) => buildMethodDriver(className, m)).join('\n');
  return `
public class Main {
  // Every number that appears immediately after a given label, in order.
  // Backs the "math that checks out" relation check: the label locates the
  // number ("You made $" -> 79.8) so two series can be paired up across a
  // program that repeats the same block many times.
  static java.util.List<Double> __numsAfter(String text, String label) {
    java.util.List<Double> out = new java.util.ArrayList<Double>();
    if (label.isEmpty()) return out;
    java.util.regex.Pattern num = java.util.regex.Pattern.compile("-?\\\\$?\\\\d[\\\\d,]*(?:\\\\.\\\\d+)?");
    int from = 0;
    while (true) {
      int at = text.indexOf(label, from);
      if (at < 0) break;
      int after = at + label.length();
      // Stop at the end of the line so a label never picks up a number from
      // the line below it.
      int eol = text.indexOf('\\n', after);
      if (eol < 0) eol = text.length();
      java.util.regex.Matcher m = num.matcher(text.substring(after, eol));
      if (m.find()) {
        try {
          out.add(Double.parseDouble(m.group().replaceAll("[$,]", "")));
        } catch (Exception ignored) { }
      }
      from = after;
    }
    return out;
  }

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
    const payload = await req.json();
    const { submission_id, session_token, coding_problem_id, code, final } = payload;

    // ---- Plain run: compile and run the code as-is and hand back what it
    // printed. No driver, no test cases, no scoring, nothing written to the
    // submission. This is what makes a hand-graded problem quick to mark -
    // the teacher reads the code and runs it in the same window - and it also
    // lets a student check their own work before submitting, which is the
    // cheapest way to stop uncompilable code arriving in the first place.
    if (payload.action === 'runPlain') {
      if (typeof payload.code !== 'string' || !payload.code.trim()) {
        return json({ error: 'There is no code to run.' }, 400);
      }

      // Either the student who owns this submission, or a teacher who owns the
      // course it belongs to. Anyone else gets nothing - otherwise this would
      // be a way to run arbitrary code against the runner using its API key.
      let allowed = false;
      if (payload.submission_id) {
        const { data: sub } = await admin
          .from('submissions')
          .select('student_user_id, session_token, coding_problem_id')
          .eq('id', payload.submission_id)
          .maybeSingle();
        if (sub) {
          const student = await getStudentFromRequest(req, admin);
          const isOwner = sub.student_user_id
            ? !!student && sub.student_user_id === student.id
            : sub.session_token === payload.session_token;
          if (isOwner) allowed = true;
          if (!allowed) {
            const teacher = await getTeacherFromRequest(req, admin);
            if (teacher && sub.coding_problem_id) {
              allowed = await teacherOwnsRow(admin, teacher.id, 'coding_problems', sub.coding_problem_id);
            }
          }
        }
      }
      if (!allowed) return json({ error: 'Unauthorized' }, 401);

      const { imports: plainImports, body: plainBody } = hoistImportsAndStripPackage(payload.code);
      // Run the student's class directly, so whatever they named their entry
      // point still works: the file is theirs, not wrapped in a driver.
      const plainSource = `${plainImports.join('\n')}${plainImports.length ? '\n\n' : ''}${plainBody}`;
      // The Piston filename has to match this exactly - see
      // extractPublicClassName - or a submission with a public class named
      // anything but "Main" fails to compile through no fault of the student.
      const plainFileName = extractPublicClassName(plainBody) || 'Main';

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const key = Deno.env.get('PISTON_API_KEY');
      if (key) headers['Authorization'] = key;

      const resp = await fetch(PISTON_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          language: 'java',
          version: '*',
          files: [{ name: plainFileName, content: plainSource }],
          stdin: String(payload.stdin ?? ''),
        }),
      });
      if (!resp.ok) return json({ error: `Execution service error: ${resp.status}` }, 502);

      const result = await resp.json();
      return json({
        stdout: result?.run?.stdout || '',
        stderr: result?.run?.stderr || result?.compile?.stderr || '',
        // Piston reports a kill as a signal rather than an exit code, which is
        // how an infinite loop in student code shows up.
        timed_out: result?.run?.signal === 'SIGKILL',
      });
    }

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

    const { imports, body } = hoistImportsAndStripPackage(code);
    // What the student actually named their class - see extractStudentClassName
    // - not problem.class_name, which is only ever a suggestion now.
    const studentClassName = extractStudentClassName(body) || problem.class_name;
    const driverSource = buildDriver(problem, studentClassName);
    const importBlock = imports.length > 0 ? `${imports.join('\n')}\n\n` : '';
    const combinedSource = `${importBlock}${driverSource}\n\n${stripPublicModifier(body, studentClassName)}`;

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
        l.startsWith('__CHK__:')
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
      // The teacher's own message for this check, shown only on failure.
      // Kept separate from `detail` so a hidden test can show the hint
      // without also revealing the machine-generated reason.
      hint?: string;
    }[] = [];

    for (const method of problem.methods) {
      const { method_name, harness_type, test_cases } = method;

      if (harness_type === 'program_output') {
        // Mirrors the grouping in buildMethodDriver: checks sharing an input
        // share one run, and the excerpt/crash for that run is reported once
        // against the group index rather than per check.
        const groupOf = new Map<string, number>();
        const seenStdin = new Map<string, number>();
        for (const tc of test_cases) {
          const key = String(tc.stdin ?? '');
          if (!seenStdin.has(key)) seenStdin.set(key, seenStdin.size);
          groupOf.set(tc.id, seenStdin.get(key)!);
        }

        for (const tc of test_cases) {
          const g = groupOf.get(tc.id);
          const chkPrefix = `__CHK__:${method_name}:${tc.id}:`;
          const excPrefix = `__EXC__:${method_name}:${g}:`;
          const errPrefix = `__ERROR__:${method_name}:${g}:`;
          const chkLine = lines.find((l) => l.startsWith(chkPrefix));
          const excLine = lines.find((l) => l.startsWith(excPrefix));
          const errLine = lines.find((l) => l.startsWith(errPrefix));

          // The verdict was decided in Java; this only unpacks it. Count
          // checks append what they actually found, after the verdict.
          const chkRest = chkLine ? chkLine.slice(chkPrefix.length) : '';
          const passed = chkRest.startsWith('1');
          const foundCount = chkRest.includes(':') ? chkRest.split(':')[1] : null;
          let output = '';
          if (excLine) {
            try {
              output = new TextDecoder().decode(
                Uint8Array.from(atob(excLine.slice(excPrefix.length)), (c) => c.charCodeAt(0))
              );
            } catch {
              output = '';
            }
          }

          const expected = String(tc.expected_output ?? '');
          const asNumber = tc.check_kind === 'output_contains_number';
          const isRelation = tc.check_kind === 'output_number_relation';
          const isCount = tc.check_kind === 'output_repeat_count';
          const OP_WORD: Record<string, string> = {
            times: '×',
            divided: '÷',
            plus: '+',
            minus: '−',
          };
          const COUNT_WORD: Record<string, string> = {
            exactly: 'exactly',
            at_least: 'at least',
            at_most: 'at most',
          };
          const wanted = isRelation
            ? `the number after "${tc.relation_b}" to equal the number after "${tc.relation_a}" ${
                OP_WORD[tc.relation_op || 'times']
              } ${tc.relation_value}`
            : asNumber
            ? `the number ${expected}`
            : `"${expected}"`;

          let detail: string;
          if (errLine) {
            const crashed = errLine.slice(errPrefix.length);
            detail = `Program crashed: ${crashed}`;
          } else if (!chkLine) {
            detail = 'The program did not run for this test.';
          } else if (passed) {
            detail = isCount
              ? `Found "${expected}" ${foundCount} time${foundCount === '1' ? '' : 's'}`
              : isRelation
              ? 'The numbers add up on every line'
              : asNumber
              ? `Found ${expected} in the output`
              : `Found "${expected}" in the output`;
          } else if (isCount) {
            detail = `Expected "${expected}" ${COUNT_WORD[tc.count_op || 'exactly']} ${
              tc.count_value
            } time${String(tc.count_value) === '1' ? '' : 's'}, but found it ${foundCount ?? 0} time${
              foundCount === '1' ? '' : 's'
            }`;
          } else if (output.trim() === '') {
            detail = isRelation
              ? 'The program printed nothing to check.'
              : `Expected the output to contain ${wanted}, but the program printed nothing`;
          } else if (isRelation) {
            detail = `Expected ${wanted}, but that did not hold. Output began: ${output.trim()}`;
          } else {
            detail = `Expected the output to contain ${wanted}, but got: ${output.trim()}`;
          }

          results.push({
            method_name,
            test_id: tc.id,
            label: tc.hidden ? 'Hidden test' : tc.label,
            hidden: !!tc.hidden,
            passed,
            points_earned: passed ? tc.points : 0,
            points_possible: tc.points,
            hint: tc.fail_message || undefined,
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
            hint: tc.fail_message || undefined,
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
            hint: tc.fail_message || undefined,
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
      // A hidden check still never reveals the machine-generated reason, but
      // it does show the teacher's own message - that text is authored, not
      // derived from the answer key, and a hint the student cannot see is
      // no use to anyone.
      test_results: results.map(({ hint, ...r }) => {
        if (r.hidden) {
          return { ...r, detail: r.passed ? 'Passed' : hint || 'Failed' };
        }
        return !r.passed && hint ? { ...r, detail: `${r.detail} — ${hint}` } : r;
      }),
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
