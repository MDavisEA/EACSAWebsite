import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest } from '../_shared/teacherAuth.ts';
import { extractGistId, fetchGistJavaFiles } from '../_shared/gist.ts';

// Students see the rubric (it's the point - they should know what they're
// reviewed against) but never review_prompt, which is instructions aimed at
// the teacher's AI review pass, not the student.
function sanitizeForStudent(project: Record<string, any>) {
  return {
    id: project.id,
    title: project.title,
    description_html: project.description_html,
    rubric_md: project.rubric_md,
    starter_files: project.starter_files || [],
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
      const { data, error } = await admin.from('projects').select('*').eq('is_active', true);
      if (error) return json({ error: error.message }, 500);
      return json({ results: (data || []).map(sanitizeForStudent) });
    }

    if (action === 'getActive') {
      const { data, error } = await admin
        .from('projects')
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
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ results: data || [] });
    }

    if (action === 'create') {
      const { data, error } = await admin.from('projects').insert(body.data).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'update') {
      const { data, error } = await admin
        .from('projects')
        .update(body.data)
        .eq('id', body.id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'delete') {
      const { error } = await admin.from('projects').delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // Lets a teacher populate starter code from a gist instead of (or in
    // addition to) dragging files in directly - reuses the exact same fetch
    // logic used for a student's own submission gist.
    if (action === 'fetchStarterGist') {
      const gistId = extractGistId(body.gist_url || '');
      if (!gistId) return json({ error: "That doesn't look like a gist URL." }, 400);
      const fetched = await fetchGistJavaFiles(gistId);
      if ('error' in fetched) return json({ error: fetched.error }, 400);
      return json({ result: { files: fetched.files } });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
