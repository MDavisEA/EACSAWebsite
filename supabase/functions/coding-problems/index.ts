import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest } from '../_shared/teacherAuth.ts';

// Students get starter code, description, and the LABELS of test cases
// (so they know what's being checked) but never expected_output, method_args,
// or which ones are hidden - that's exactly the info that would let someone
// game the autograder instead of solving the problem. A problem can test
// several methods, so checks are grouped per method rather than flattened.
function sanitizeForStudent(problem: Record<string, any>) {
  return {
    id: problem.id,
    title: problem.title,
    description_html: problem.description_html,
    language: problem.language,
    class_name: problem.class_name,
    starter_code: problem.starter_code,
    points_possible: problem.points_possible,
    methods: (problem.methods || []).map((m: Record<string, any>) => ({
      method_name: m.method_name,
      visible_checks: (m.test_cases || [])
        .filter((tc: Record<string, any>) => !tc.hidden)
        .map((tc: Record<string, any>) => ({ id: tc.id, label: tc.label, points: tc.points })),
      hidden_check_count: (m.test_cases || []).filter((tc: Record<string, any>) => tc.hidden).length,
    })),
  };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = createAdminClient();
    const body = await req.json();
    const { action } = body;

    if (action === 'listActive') {
      const { data, error } = await admin.from('coding_problems').select('*').eq('is_active', true);
      if (error) return json({ error: error.message }, 500);
      return json({ results: (data || []).map(sanitizeForStudent) });
    }

    if (action === 'getActive') {
      const { data, error } = await admin
        .from('coding_problems')
        .select('*')
        .eq('id', body.id)
        .eq('is_active', true)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data ? sanitizeForStudent(data) : null });
    }

    // ---- Teacher-only ----

    const teacher = await getTeacherFromRequest(req, admin);
    if (!teacher) return json({ error: 'Unauthorized' }, 401);

    if (action === 'list') {
      const { data, error } = await admin
        .from('coding_problems')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ results: data || [] });
    }

    if (action === 'create') {
      const { data, error } = await admin.from('coding_problems').insert(body.data).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'update') {
      const { data, error } = await admin
        .from('coding_problems')
        .update(body.data)
        .eq('id', body.id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'delete') {
      const { error } = await admin.from('coding_problems').delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
