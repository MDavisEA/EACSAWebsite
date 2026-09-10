import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Finds (or creates) the unit in `targetCourseId` matching `sourceUnitName` by
// name - keeps a linked course's units aligned with the source without a
// separate mapping table, and means a whole new unit the source teacher adds
// gets created on the target side the first time something in it propagates.
async function findOrCreateUnit(
  admin: SupabaseClient,
  targetCourseId: string,
  sourceUnitName: string | null
): Promise<string | null> {
  if (!sourceUnitName) return null;
  const { data: existing } = await admin
    .from('units')
    .select('id')
    .eq('course_id', targetCourseId)
    .eq('name', sourceUnitName)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await admin
    .from('units')
    .insert({ course_id: targetCourseId, name: sourceUnitName })
    .select('id')
    .single();
  return created?.id ?? null;
}

/**
 * Copies a newly-created row into every course linked to `row.course_id`.
 * `table` is the row's own table; `row` is exactly what was just inserted
 * (its real id/course_id included). Best-effort and silent on failure - the
 * teacher's own save already succeeded, and a colleague's copy failing to
 * land must never turn into an error on the save that has nothing to do
 * with them.
 */
export async function propagateToLinkedCourses(
  admin: SupabaseClient,
  table: 'assignments' | 'coding_problems' | 'projects' | 'notes',
  row: Record<string, any>
): Promise<void> {
  try {
    const { data: links } = await admin
      .from('course_links')
      .select('target_course_id')
      .eq('source_course_id', row.course_id);
    if (!links || links.length === 0) return;

    let sourceUnitName: string | null = null;
    if (row.unit_id) {
      const { data: unit } = await admin.from('units').select('name').eq('id', row.unit_id).maybeSingle();
      sourceUnitName = unit?.name || null;
    }

    const { id, course_id, unit_id, created_at, updated_at, ...rest } = row;
    // notes has no unit_id column at all (it is a flat per-course list, not
    // grouped) - including the key even as null/undefined still fails the
    // insert with an unrecognized-column error, since this is a plain object
    // handed straight to postgrest, not a partial update against a known row.
    const hasUnit = table !== 'notes';
    // Same convention as duplicating or copying-from-shared elsewhere in this
    // app (coding-problems' copyToMyCourse, TeacherDashboard's Duplicate): a
    // copy always starts inactive/unpublished, regardless of the source's own
    // state - it is the colleague's course, and the copy going live to their
    // students the instant it is created (with due dates and settings they
    // never chose) would be a surprise, not a convenience.
    const liveFlagOverride =
      table === 'notes' ? { is_published: false } : 'is_active' in rest ? { is_active: false } : {};
    for (const link of links) {
      try {
        const targetUnitId = hasUnit ? await findOrCreateUnit(admin, link.target_course_id, sourceUnitName) : undefined;
        const insertRow: Record<string, any> = { ...rest, ...liveFlagOverride, course_id: link.target_course_id };
        if (hasUnit) insertRow.unit_id = targetUnitId;
        const { error: copyErr } = await admin.from(table).insert(insertRow);
        if (copyErr) {
          // Not re-thrown - see the function doc comment - but still worth a
          // trace in the function logs, since a copy that never lands and
          // never surfaces anywhere is exactly the failure mode to avoid.
          console.error(`propagateToLinkedCourses: ${table} -> ${link.target_course_id} failed: ${copyErr.message}`);
        }
      } catch (e) {
        console.error(`propagateToLinkedCourses: ${table} -> ${link.target_course_id} threw: ${(e as Error).message}`);
      }
    }
  } catch {
    // See doc comment above - never let this bubble up to the caller.
  }
}
