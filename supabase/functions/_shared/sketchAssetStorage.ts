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
