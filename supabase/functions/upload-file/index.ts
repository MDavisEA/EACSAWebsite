import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest } from '../_shared/teacherAuth.ts';

const BUCKET = 'uploads';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = createAdminClient();
    const teacher = await getTeacherFromRequest(req, admin);
    if (!teacher) return json({ error: 'Unauthorized' }, 401);

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return json({ error: 'No file provided' }, 400);

    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
    const path = `${teacher.id}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (uploadError) return json({ error: uploadError.message }, 500);

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return json({ file_url: data.publicUrl });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
