import { handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/teacherAuth.ts';
import { purgeAssetsForSubmissions } from '../_shared/sketchAssetStorage.ts';

// Deletes a Processing sketch's uploaded images a week after the student's grade became visible
// to them (submissions.feedback_visible_at), so photos do not fill the free plan's file storage.
// The code, scores and comments are untouched; only the files go, and the submission is marked
// (assets_purged_at) so the pages can explain it.
//
// Called once a day by a pg_cron job (see CLAUDE.md), not by the browser. The platform gateway
// only checks that a JWT is present (the public anon key will do), so the real gate is the shared
// secret header below. `{ "dryRun": true }` reports what would go without deleting anything.

const PURGE_AFTER_DAYS = 7;
const BATCH = 100;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    const secret = Deno.env.get('SKETCH_CLEANUP_SECRET') || '';
    const given = req.headers.get('x-cleanup-secret') || '';
    if (!secret || !safeEqual(secret, given)) return json({ error: 'Not allowed' }, 403);

    let dryRun = false;
    try { dryRun = (await req.json())?.dryRun === true; } catch { /* no body */ }

    const admin = createAdminClient();
    const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
    // Only grades that are still visible (released) and old enough; never one that was regraded.
    const { data: due, error } = await admin
      .from('submissions')
      .select('id')
      .not('project_id', 'is', null)
      .eq('feedback_released', true)
      .not('feedback_visible_at', 'is', null)
      .lt('feedback_visible_at', cutoff)
      .is('assets_purged_at', null)
      .limit(BATCH);
    if (error) return json({ error: error.message }, 500);
    const ids = (due || []).map((r: Record<string, any>) => r.id);

    // Which of them actually have files (no point marking the rest).
    const { data: withFiles } = ids.length
      ? await admin.from('sketch_assets').select('submission_id, size_bytes').in('submission_id', ids)
      : { data: [] as Record<string, any>[] };
    const haveFiles = [...new Set((withFiles || []).map((r: Record<string, any>) => r.submission_id))];
    const bytes = (withFiles || []).reduce((n: number, r: Record<string, any>) => n + (r.size_bytes || 0), 0);

    if (dryRun) return json({ dryRun: true, submissions: haveFiles.length, files: (withFiles || []).length, bytes });

    const purged = await purgeAssetsForSubmissions(admin, haveFiles);
    if (purged.length > 0) {
      const { error: markErr } = await admin
        .from('submissions')
        .update({ assets_purged_at: new Date().toISOString() })
        .in('id', purged);
      if (markErr) return json({ error: markErr.message, purged: purged.length }, 500);
    }
    return json({ submissions: purged.length, files: (withFiles || []).length, bytes });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
