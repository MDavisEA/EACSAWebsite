import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const SKETCH_BUCKET = 'sketch-assets';

/**
 * Removes the stored files for every sketch asset belonging to these
 * submissions. Call BEFORE deleting the rows: the sketch_assets rows cascade
 * away with their submission, and with them the only record of which Storage
 * objects to delete - leaving a student's uploaded images orphaned in the
 * bucket with nothing pointing at them.
 *
 * Best-effort and silent on failure: the delete the caller is performing must
 * not be blocked by a storage hiccup.
 */
export async function deleteAssetsForSubmissions(admin: SupabaseClient, submissionIds: string[]): Promise<void> {
  try {
    if (submissionIds.length === 0) return;
    const { data } = await admin.from('sketch_assets').select('storage_path').in('submission_id', submissionIds);
    const paths = (data || []).map((r: Record<string, any>) => r.storage_path);
    for (let i = 0; i < paths.length; i += 100) {
      await admin.storage.from(SKETCH_BUCKET).remove(paths.slice(i, i + 100));
    }
  } catch (e) {
    console.error(`deleteAssetsForSubmissions failed: ${(e as Error).message}`);
  }
}

/** Every submission id under these projects - for deleting a project or a whole course. */
export async function submissionIdsForProjects(admin: SupabaseClient, projectIds: string[]): Promise<string[]> {
  if (projectIds.length === 0) return [];
  const { data } = await admin.from('submissions').select('id').in('project_id', projectIds);
  return (data || []).map((r: Record<string, any>) => r.id);
}

/**
 * Deletes the stored files AND index rows for these submissions' sketch assets, strictly: a
 * submission's rows are only removed once its files are, so a Storage failure leaves the rows
 * (the only record of what to delete) in place for the next run instead of orphaning files.
 * Returns the ids of submissions whose assets were actually removed.
 */
export async function purgeAssetsForSubmissions(admin: SupabaseClient, submissionIds: string[]): Promise<string[]> {
  const purged: string[] = [];
  for (const id of submissionIds) {
    const { data, error } = await admin.from('sketch_assets').select('storage_path').eq('submission_id', id);
    if (error) { console.error(`purge: list failed for ${id}: ${error.message}`); continue; }
    const paths = (data || []).map((r: Record<string, any>) => r.storage_path);
    if (paths.length === 0) continue;
    let ok = true;
    for (let i = 0; i < paths.length && ok; i += 100) {
      const { error: rmErr } = await admin.storage.from(SKETCH_BUCKET).remove(paths.slice(i, i + 100));
      if (rmErr) { console.error(`purge: storage remove failed for ${id}: ${rmErr.message}`); ok = false; }
    }
    if (!ok) continue;
    const { error: delErr } = await admin.from('sketch_assets').delete().eq('submission_id', id);
    if (delErr) { console.error(`purge: row delete failed for ${id}: ${delErr.message}`); continue; }
    purged.push(id);
  }
  return purged;
}
