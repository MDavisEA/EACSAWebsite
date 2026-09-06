import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// A per-section override of one work item's due date - a teacher with more
// than one block on a roster can give one block a different deadline
// without a second, separate assignment. `kind` selects which of the three
// nullable work-reference columns on section_due_dates is in play; every
// function here only ever deals with the one kind it owns.
export type WorkKind = 'assignment_id' | 'coding_problem_id' | 'project_id';

// { section_id -> due_date } for every override on one work item, keyed by
// work id for a batch of items at once.
export type OverridesByWorkId = Map<string, Map<string, string>>;

export async function fetchOverridesByWorkId(
  admin: SupabaseClient,
  kind: WorkKind,
  workIds: string[]
): Promise<OverridesByWorkId> {
  const map: OverridesByWorkId = new Map();
  if (workIds.length === 0) return map;
  const { data } = await admin
    .from('section_due_dates')
    .select(`${kind}, section_id, due_date`)
    .in(kind, workIds);
  for (const row of (data || []) as Record<string, any>[]) {
    const workId = row[kind];
    if (!map.has(workId)) map.set(workId, new Map());
    map.get(workId)!.set(row.section_id, row.due_date);
  }
  return map;
}

// Attaches each row's own overrides as a plain array, for the teacher-facing
// `list` a form hydrates itself from - editing an assignment needs to see
// what is already set per section.
export async function attachSectionDueDates(
  admin: SupabaseClient,
  kind: WorkKind,
  rows: Record<string, any>[]
): Promise<Record<string, any>[]> {
  const overrides = await fetchOverridesByWorkId(admin, kind, rows.map((r) => r.id));
  return rows.map((r) => ({
    ...r,
    section_due_dates: [...(overrides.get(r.id)?.entries() || [])].map(([section_id, due_date]) => ({
      section_id,
      due_date,
    })),
  }));
}

// Replaces the whole set for one work item - re-saving the form is the only
// way these change, so there is never a reason to patch one entry at a time.
export async function replaceSectionDueDates(
  admin: SupabaseClient,
  kind: WorkKind,
  workId: string,
  entries: Record<string, any>[] | undefined
): Promise<{ error: string | null }> {
  const { error: delErr } = await admin.from('section_due_dates').delete().eq(kind, workId);
  if (delErr) return { error: delErr.message };
  const clean = (entries || []).filter((e) => e?.section_id && e?.due_date);
  if (clean.length === 0) return { error: null };
  const { error: insErr } = await admin
    .from('section_due_dates')
    .insert(clean.map((e) => ({ [kind]: workId, section_id: e.section_id, due_date: e.due_date })));
  return { error: insErr ? insErr.message : null };
}

// Swaps in the resolved due date for ONE identity's section on each row -
// deliberately not touching workItems.ts's buildWorkItems: its is_late and
// status logic already just reads whatever due_date sits on the row, so
// resolving it here first is enough, and every caller of buildWorkItems
// keeps working unchanged for anyone with no section-specific override.
//
// `sectionIdFor` is per-row rather than one scalar because a single
// identity (a student on two of a teacher's courses, or a roster loop
// walking many rows) can need a different section resolved for each row.
export function resolveDueDates(
  rows: Record<string, any>[],
  overridesByWorkId: OverridesByWorkId,
  sectionIdFor: (row: Record<string, any>) => string | null | undefined
): Record<string, any>[] {
  return rows.map((r) => {
    const sectionId = sectionIdFor(r);
    if (!sectionId) return r;
    const override = overridesByWorkId.get(r.id)?.get(sectionId);
    return override ? { ...r, due_date: override } : r;
  });
}
