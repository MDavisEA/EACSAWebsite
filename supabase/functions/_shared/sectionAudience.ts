import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// A coding problem can be limited to some of its course's sections (blocks),
// e.g. a different quiz per block. `section_ids` empty means everyone.
//
// Fails closed: a restricted problem is invisible to anyone we cannot place
// in one of its sections - an anonymous caller, or a signed-in student who is
// not on the roster or has no section.
export async function studentSectionId(
  admin: SupabaseClient,
  student: { email: string } | null | undefined,
  courseId: string | null | undefined
): Promise<string | null> {
  if (!student || !courseId) return null;
  const { data } = await admin
    .from('roster_students')
    .select('section_id')
    .eq('course_id', courseId)
    .ilike('email', student.email)
    .maybeSingle();
  return data?.section_id ?? null;
}

export function inAudience(problem: Record<string, any>, sectionId: string | null): boolean {
  const ids: string[] = problem.section_ids || [];
  if (ids.length === 0) return true;
  return !!sectionId && ids.includes(sectionId);
}

// Keeps only ids that are real sections of this course, so a request cannot
// aim a problem at another teacher's section.
export async function validSectionIds(
  admin: SupabaseClient,
  courseId: string | null | undefined,
  ids: unknown
): Promise<string[]> {
  if (!courseId || !Array.isArray(ids) || ids.length === 0) return [];
  const { data } = await admin.from('sections').select('id').eq('course_id', courseId).in('id', ids as string[]);
  return (data || []).map((s: Record<string, any>) => s.id);
}
