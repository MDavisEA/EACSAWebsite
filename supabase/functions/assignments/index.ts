import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest } from '../_shared/teacherAuth.ts';

// Fields that must NEVER be sent to a student who is actively taking an exam -
// showing these would just be handing out the answers.
function stripAnswerKeys(assignment: Record<string, any>) {
  const clean = { ...assignment };
  delete clean.answer_key_url;
  clean.questions = (assignment.questions || []).map((q: Record<string, any>) => {
    const { answer_key_html, answer_key_image_url, ...restQ } = q;
    return {
      ...restQ,
      parts: (q.parts || []).map((p: Record<string, any>) => {
        const { answer_key_html: _ak, answer_key_image_url: _aki, ...restP } = p;
        return restP;
      }),
    };
  });
  return clean;
}

// For the "check my score" lookup: answer keys are only included if the
// teacher has actually turned show_answer_key on for that assignment.
// (The old app had a toggle for this that didn't actually do anything -
// this is the fix.)
function applyShowAnswerKeyGate(assignment: Record<string, any>) {
  if (assignment.show_answer_key) return assignment;
  return stripAnswerKeys(assignment);
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = createAdminClient();
    const body = await req.json();
    const { action } = body;

    // ---- Public, student-facing actions ----

    if (action === 'examGet') {
      const { data, error } = await admin
        .from('assignments')
        .select('*')
        .eq('id', body.id)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ results: [] });
      return json({ results: [stripAnswerKeys(data)] });
    }

    if (action === 'listFeatured') {
      const { data, error } = await admin
        .from('assignments')
        .select('*')
        .eq('featured', true)
        .eq('is_active', true);
      if (error) return json({ error: error.message }, 500);
      return json({ results: (data || []).map(stripAnswerKeys) });
    }

    if (action === 'scoreLookupList') {
      const { data, error } = await admin.from('assignments').select('*');
      if (error) return json({ error: error.message }, 500);
      return json({ results: (data || []).map(applyShowAnswerKeyGate) });
    }

    // ---- Teacher-only actions ----

    const teacher = await getTeacherFromRequest(req, admin);
    if (!teacher) return json({ error: 'Unauthorized' }, 401);

    if (action === 'list') {
      const column = body.sort?.column || 'created_at';
      const ascending = body.sort?.ascending ?? false;
      const { data, error } = await admin
        .from('assignments')
        .select('*')
        .order(column, { ascending });
      if (error) return json({ error: error.message }, 500);
      return json({ results: data || [] });
    }

    if (action === 'create') {
      const { data, error } = await admin
        .from('assignments')
        .insert(body.data)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'update') {
      const { data, error } = await admin
        .from('assignments')
        .update(body.data)
        .eq('id', body.id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'delete') {
      const { error } = await admin.from('assignments').delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
