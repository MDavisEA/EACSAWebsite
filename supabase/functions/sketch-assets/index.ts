import { handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest, teacherOwnsRow } from '../_shared/teacherAuth.ts';
import { getStudentFromRequest } from '../_shared/studentAuth.ts';
import {
  MAX_ASSET_BYTES,
  MAX_ASSET_COUNT,
  MAX_ASSETS_TOTAL_BYTES,
  cleanAssetName,
  contentTypeForAsset,
} from '../_shared/sketchFiles.ts';
import { SKETCH_BUCKET } from '../_shared/sketchAssetStorage.ts';

// The data/ folder of a Processing sketch turned in on the site: images (and
// the occasional .vlw font or text file) that a student's code loads by name.
//
// Authorization is the whole point of this function, because the bucket is
// private and the service role can read anything:
//  - upload / remove: only the student who owns the submission.
//  - list: that student, or the teacher who owns the course the project is in.
// Nothing here ever trusts a path from the request - storage paths are
// generated here, and looked up from sketch_assets rows by id.

const SIGNED_URL_SECONDS = 60 * 60;

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = createAdminClient();

    // upload is multipart (a file); everything else is JSON like the other functions.
    const isMultipart = (req.headers.get('content-type') || '').includes('multipart/form-data');
    let form: FormData | null = null;
    let body: Record<string, any> = {};
    if (isMultipart) {
      // Refuse before buffering: req.formData() reads the whole body into
      // memory, and the per-file limit is only checked once it already has. A
      // little headroom over the limit covers the multipart framing.
      const declared = Number(req.headers.get('content-length') || '0');
      if (declared > MAX_ASSET_BYTES + 64 * 1024) {
        return json({ error: `That file is too large - the limit is ${MAX_ASSET_BYTES / 1048576} MB per file.` }, 413);
      }
      form = await req.formData();
      body = { action: 'upload', submission_id: form.get('submission_id') };
    } else {
      body = await req.json();
    }
    const { action, submission_id } = body;
    if (!submission_id || typeof submission_id !== 'string') return json({ error: 'submission_id is required' }, 400);

    const { data: sub } = await admin
      .from('submissions')
      .select('id, project_id, student_user_id')
      .eq('id', submission_id)
      .maybeSingle();
    if (!sub || !sub.project_id) return json({ error: 'Not found' }, 404);

    const student = await getStudentFromRequest(req, admin);
    const isOwner = !!student && sub.student_user_id === student.id;

    // ---- list: the owner, or the teacher whose course this is ----
    if (action === 'list') {
      let allowed = isOwner;
      if (!allowed) {
        const teacher = await getTeacherFromRequest(req, admin);
        allowed = !!teacher && (await teacherOwnsRow(admin, teacher.id, 'projects', sub.project_id));
      }
      if (!allowed) return json({ error: 'Not found' }, 404);

      const { data: rows, error } = await admin
        .from('sketch_assets')
        .select('id, name, size_bytes, content_type, storage_path')
        .eq('submission_id', submission_id)
        .order('name');
      if (error) return json({ error: error.message }, 500);
      const list = rows || [];
      const signed = list.length
        ? await admin.storage.from(SKETCH_BUCKET).createSignedUrls(list.map((r) => r.storage_path), SIGNED_URL_SECONDS)
        : { data: [] as { signedUrl: string }[] };
      return json({
        results: list.map((r, i) => ({
          id: r.id,
          name: r.name,
          size_bytes: r.size_bytes,
          content_type: r.content_type,
          url: signed.data?.[i]?.signedUrl ?? null,
        })),
      });
    }

    // Everything below changes a student's own sketch.
    if (!student) return json({ error: 'Please sign in with your school Google account to continue.' }, 401);
    if (!isOwner) return json({ error: 'Not found' }, 404);

    const { data: proj } = await admin.from('projects').select('is_active, kind').eq('id', sub.project_id).maybeSingle();
    if (!proj || proj.kind !== 'sketch') return json({ error: 'This project does not take sketch files.' }, 400);
    if (!proj.is_active) return json({ error: 'This project is no longer accepting changes.' }, 409);

    if (action === 'remove') {
      const { asset_id } = body;
      if (!asset_id) return json({ error: 'asset_id is required' }, 400);
      const { data: asset } = await admin
        .from('sketch_assets')
        .select('id, storage_path')
        .eq('id', asset_id)
        .eq('submission_id', submission_id)
        .maybeSingle();
      if (!asset) return json({ error: 'Not found' }, 404);
      await admin.storage.from(SKETCH_BUCKET).remove([asset.storage_path]);
      const { error } = await admin.from('sketch_assets').delete().eq('id', asset.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    if (action === 'upload') {
      const file = form?.get('file');
      if (!(file instanceof File)) return json({ error: 'No file provided' }, 400);

      const name = cleanAssetName(file.name);
      const contentType = name ? contentTypeForAsset(name) : null;
      if (!name || !contentType) {
        return json(
          { error: `"${file.name}" can't be used here. Upload images (.png .jpg .gif), a .vlw font, or a .txt/.csv/.json file, with a simple file name.` },
          400
        );
      }
      if (file.size > MAX_ASSET_BYTES) {
        return json({ error: `"${name}" is ${(file.size / 1048576).toFixed(1)} MB - the limit is ${MAX_ASSET_BYTES / 1048576} MB per file.` }, 400);
      }

      const { data: existing } = await admin
        .from('sketch_assets')
        .select('id, name, size_bytes, storage_path')
        .eq('submission_id', submission_id);
      const rows = existing || [];
      const replacing = rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
      const others = rows.filter((r) => r !== replacing);
      if (!replacing && rows.length >= MAX_ASSET_COUNT) {
        return json({ error: `A sketch can have at most ${MAX_ASSET_COUNT} files.` }, 400);
      }
      const total = others.reduce((sum, r) => sum + r.size_bytes, 0) + file.size;
      if (total > MAX_ASSETS_TOTAL_BYTES) {
        return json({ error: `That would put this sketch over ${MAX_ASSETS_TOTAL_BYTES / 1048576} MB of files in total.` }, 400);
      }

      const storagePath = `${submission_id}/${crypto.randomUUID()}`;
      const { error: uploadError } = await admin.storage
        .from(SKETCH_BUCKET)
        .upload(storagePath, file, { contentType, upsert: false });
      if (uploadError) return json({ error: uploadError.message }, 500);

      const record = { name, size_bytes: file.size, content_type: contentType, storage_path: storagePath };
      const saved = replacing
        ? await admin.from('sketch_assets').update(record).eq('id', replacing.id).select('id, name, size_bytes, content_type').single()
        : await admin.from('sketch_assets').insert({ ...record, submission_id }).select('id, name, size_bytes, content_type').single();
      if (saved.error) {
        // Don't leave the object behind if the row never landed.
        await admin.storage.from(SKETCH_BUCKET).remove([storagePath]);
        return json({ error: saved.error.message }, 500);
      }
      if (replacing) await admin.storage.from(SKETCH_BUCKET).remove([replacing.storage_path]);
      return json({ result: saved.data });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
