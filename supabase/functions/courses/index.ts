import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { createAdminClient, getTeacherFromRequest, teacherOwnsCourse } from '../_shared/teacherAuth.ts';
import { buildWorkItems } from '../_shared/workItems.ts';

// Courses and rosters exist purely so the teacher can see who has NOT turned
// work in. Nothing here is student-facing - every action is teacher-only.
Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const admin = createAdminClient();
    const body = await req.json();
    const { action } = body;

    const teacher = await getTeacherFromRequest(req, admin);
    if (!teacher) return json({ error: 'Unauthorized' }, 401);

    // Every action below is scoped to courses this teacher owns. A course is
    // the unit of ownership for everything else on the site, so a hole here
    // would be a hole in all of it.
    const owns = (courseId: string | null | undefined) =>
      teacherOwnsCourse(admin, teacher.id, courseId);

    if (action === 'list') {
      const { data, error } = await admin
        .from('courses')
        .select('*')
        .eq('teacher_id', teacher.id)
        .order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);

      // Roster counts, units and sections come back with the list so the
      // dashboard can render a whole course without a request per course.
      const ids = (data || []).map((c: Record<string, any>) => c.id);
      const [counts, units, sections] = await Promise.all([
        ids.length ? admin.from('roster_students').select('course_id').in('course_id', ids) : { data: [] },
        ids.length ? admin.from('units').select('*').in('course_id', ids).order('position') : { data: [] },
        ids.length ? admin.from('sections').select('*').in('course_id', ids).order('position') : { data: [] },
      ]);
      const byCourse: Record<string, number> = {};
      (counts.data || []).forEach((r: Record<string, any>) => {
        byCourse[r.course_id] = (byCourse[r.course_id] || 0) + 1;
      });

      return json({
        results: (data || []).map((c: Record<string, any>) => ({
          ...c,
          student_count: byCourse[c.id] || 0,
          units: (units.data || []).filter((u: Record<string, any>) => u.course_id === c.id),
          sections: (sections.data || []).filter((s: Record<string, any>) => s.course_id === c.id),
        })),
      });
    }

    if (action === 'create') {
      // teacher_id comes from the verified session, never from the request -
      // otherwise a teacher could create a course owned by someone else.
      const { data, error } = await admin
        .from('courses')
        .insert({ ...body.data, teacher_id: teacher.id })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'update') {
      if (!(await owns(body.id))) return json({ error: 'Not found' }, 404);
      const { teacher_id: _ignored, ...safe } = body.data || {};
      const { data, error } = await admin
        .from('courses')
        .update(safe)
        .eq('id', body.id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'delete') {
      if (!(await owns(body.id))) return json({ error: 'Not found' }, 404);
      const { error } = await admin.from('courses').delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // ---- Units: how work is grouped inside a course ----

    if (action === 'createUnit' || action === 'createSection') {
      const table = action === 'createUnit' ? 'units' : 'sections';
      if (!(await owns(body.course_id))) return json({ error: 'Not found' }, 404);
      const { count } = await admin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('course_id', body.course_id);
      const { data, error } = await admin
        .from(table)
        .insert({ course_id: body.course_id, name: body.name, position: count ?? 0 })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'updateUnit' || action === 'updateSection') {
      const table = action === 'updateUnit' ? 'units' : 'sections';
      const { data: row } = await admin.from(table).select('course_id').eq('id', body.id).maybeSingle();
      if (!row || !(await owns(row.course_id))) return json({ error: 'Not found' }, 404);
      // Only writes what was actually sent - collapsing a unit sends nothing
      // but `collapsed`, and must not overwrite its name with undefined.
      const update: Record<string, unknown> = {};
      if (body.name !== undefined) update.name = body.name;
      if (body.position !== undefined) update.position = body.position;
      // `collapsed` only exists on units - sections have no such column.
      if (body.collapsed !== undefined && table === 'units') update.collapsed = body.collapsed;
      const { data, error } = await admin.from(table).update(update).eq('id', body.id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }

    if (action === 'deleteUnit' || action === 'deleteSection') {
      const table = action === 'deleteUnit' ? 'units' : 'sections';
      const { data: row } = await admin.from(table).select('course_id').eq('id', body.id).maybeSingle();
      if (!row || !(await owns(row.course_id))) return json({ error: 'Not found' }, 404);
      // Work in a deleted unit is not deleted with it - the foreign key nulls
      // the reference so it resurfaces as unfiled rather than disappearing
      // along with a unit the teacher was only reorganising.
      const { error } = await admin.from(table).delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // Reordering is sent as the whole new order rather than one moved item,
    // so the result cannot drift if two updates race or one fails halfway.

    if (action === 'reorderUnits') {
      if (!(await owns(body.course_id))) return json({ error: 'Not found' }, 404);
      const ids: string[] = Array.isArray(body.unit_ids) ? body.unit_ids : [];
      // Only units actually in this course, so a stray id cannot be used to
      // reposition something in someone else's class.
      const { data: mine } = await admin.from('units').select('id').eq('course_id', body.course_id);
      const allowed = new Set((mine || []).map((u: Record<string, any>) => u.id));
      const updates = ids
        .filter((id) => allowed.has(id))
        .map((id, i) => admin.from('units').update({ position: i }).eq('id', id));
      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) return json({ error: failed.error.message }, 500);
      return json({ success: true });
    }

    if (action === 'reorderWork') {
      if (!(await owns(body.course_id))) return json({ error: 'Not found' }, 404);
      const items: { kind: string; id: string; unit_id: string | null; sort_order: number }[] =
        Array.isArray(body.items) ? body.items : [];
      const TABLES: Record<string, string> = {
        frq: 'assignments',
        code: 'coding_problems',
        project: 'projects',
      };

      // Each row must already belong to this course - that is what stops a
      // reorder from being a way to drag another teacher's work into a unit.
      const [a, c, p] = await Promise.all([
        admin.from('assignments').select('id').eq('course_id', body.course_id),
        admin.from('coding_problems').select('id').eq('course_id', body.course_id),
        admin.from('projects').select('id').eq('course_id', body.course_id),
      ]);
      const owned: Record<string, Set<string>> = {
        frq: new Set((a.data || []).map((r: Record<string, any>) => r.id)),
        code: new Set((c.data || []).map((r: Record<string, any>) => r.id)),
        project: new Set((p.data || []).map((r: Record<string, any>) => r.id)),
      };

      // A unit must be one of this course's, or null for unfiled.
      const { data: units } = await admin.from('units').select('id').eq('course_id', body.course_id);
      const unitIds = new Set((units || []).map((u: Record<string, any>) => u.id));

      const updates = items
        .filter((it) => TABLES[it.kind] && owned[it.kind]?.has(it.id))
        .filter((it) => it.unit_id === null || unitIds.has(it.unit_id))
        .map((it) =>
          admin
            .from(TABLES[it.kind])
            .update({ sort_order: it.sort_order, unit_id: it.unit_id })
            .eq('id', it.id)
        );
      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) return json({ error: failed.error.message }, 500);
      return json({ success: true });
    }

    if (action === 'listRoster') {
      if (!(await owns(body.course_id))) return json({ error: 'Not found' }, 404);
      const { data, error } = await admin
        .from('roster_students')
        .select('*')
        .eq('course_id', body.course_id)
        .order('student_name', { ascending: true });
      if (error) return json({ error: error.message }, 500);

      // Flag whoever has never actually turned anything in under their roster
      // email. Usually that just means they have not started yet - but it is
      // also how a typo in the CSV shows itself, since a mistyped address can
      // never match the Google account the student signs in with.
      const { data: seen } = await admin
        .from('submissions')
        .select('student_email')
        .not('student_email', 'is', null);
      const seenEmails = new Set(
        (seen || []).map((s: Record<string, any>) => (s.student_email || '').toLowerCase())
      );

      return json({
        results: (data || []).map((r: Record<string, any>) => ({
          ...r,
          has_signed_in: seenEmails.has((r.email || '').toLowerCase()),
        })),
      });
    }

    // Removing one student from a roster - a transfer out, a schedule
    // change, a name entered twice. Only removes the roster row itself;
    // anything they already submitted stays exactly as it is (submissions
    // are matched by email/name at read time, not linked to this row by a
    // foreign key), so this cannot make a grade or a turned-in project
    // disappear along with them.
    if (action === 'removeRosterStudent') {
      const { data: row } = await admin.from('roster_students').select('course_id').eq('id', body.id).maybeSingle();
      if (!row || !(await owns(row.course_id))) return json({ error: 'Not found' }, 404);
      const { error } = await admin.from('roster_students').delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // The roster, but with each student's status on every active piece of
    // work in this course - "who hasn't turned in" answered per student
    // instead of per assignment. Built on the exact same status rules a
    // student's own dashboard uses (see _shared/workItems.ts), just applied
    // to a roster row's identity instead of the caller's own.
    if (action === 'rosterWithStatus') {
      if (!(await owns(body.course_id))) return json({ error: 'Not found' }, 404);
      const course_id = body.course_id;

      const [rosterRes, assignments, problems, projects, units] = await Promise.all([
        admin.from('roster_students').select('*').eq('course_id', course_id).order('student_name', { ascending: true }),
        admin.from('assignments').select('id, title, due_date, course_id, unit_id, sort_order, questions').eq('course_id', course_id).eq('is_active', true),
        admin.from('coding_problems').select('id, title, due_date, course_id, unit_id, sort_order, points_possible').eq('course_id', course_id).eq('is_active', true),
        admin.from('projects').select('id, title, due_date, course_id, unit_id, sort_order').eq('course_id', course_id).eq('is_active', true),
        admin.from('units').select('id, course_id, name, position').eq('course_id', course_id),
      ]);
      for (const r of [rosterRes, assignments, problems, projects, units]) {
        if (r.error) return json({ error: r.error.message }, 500);
      }

      const activeAssignments = assignments.data || [];
      const activeProblems = problems.data || [];
      const activeProjects = projects.data || [];

      // Same "has this email ever submitted anything at all" check listRoster
      // already does, kept separate from and unrelated to the course-scoped
      // submissions pulled below - has_signed_in is deliberately whole-site,
      // not "have they done THIS class's work."
      const { data: seen } = await admin.from('submissions').select('student_email').not('student_email', 'is', null);
      const seenEmails = new Set((seen || []).map((s: Record<string, any>) => (s.student_email || '').toLowerCase()));

      const workIds = [
        ...activeAssignments.map((a: Record<string, any>) => a.id),
        ...activeProblems.map((p: Record<string, any>) => p.id),
        ...activeProjects.map((p: Record<string, any>) => p.id),
      ];
      let courseSubs: Record<string, any>[] = [];
      if (workIds.length > 0) {
        // Chunked the same way unscoredSubmissionsFor (submissions/index.ts)
        // is - these ids ride in an .or() filter that would eventually
        // overflow a URL for a course with a very large amount of work.
        const CHUNK = 100;
        for (let i = 0; i < workIds.length; i += CHUNK) {
          const slice = workIds.slice(i, i + CHUNK).join(',');
          const { data, error } = await admin
            .from('submissions')
            .select('*')
            .or(`assignment_id.in.(${slice}),coding_problem_id.in.(${slice}),project_id.in.(${slice})`);
          if (error) return json({ error: error.message }, 500);
          courseSubs.push(...(data || []));
        }
      }

      // Matches the roster CSV's own stated preference: email first (exact,
      // what Google sign-in gives us), falling back to name only for a
      // roster row that never had an email attached at all.
      const subsForRow = (row: Record<string, any>) => {
        if (row.email) {
          const email = row.email.toLowerCase();
          return courseSubs.filter((s) => (s.student_email || '').toLowerCase() === email);
        }
        const name = (row.student_name || '').trim().toLowerCase();
        return courseSubs.filter((s) => !s.student_email && (s.student_name || '').trim().toLowerCase() === name);
      };

      const roster = (rosterRes.data || []).map((r: Record<string, any>) => ({
        ...r,
        has_signed_in: seenEmails.has((r.email || '').toLowerCase()),
        items: buildWorkItems(activeAssignments, activeProblems, activeProjects, subsForRow(r)),
      }));

      return json({ roster, units: units.data || [] });
    }

    // Replaces the whole roster for a course rather than appending, so
    // re-uploading a corrected CSV is the obvious way to fix a typo instead
    // of leaving a duplicate behind.
    if (action === 'replaceRoster') {
      const { course_id, students, section_id } = body;
      if (!course_id || !Array.isArray(students)) {
        return json({ error: 'course_id and students are required' }, 400);
      }
      if (!(await owns(course_id))) return json({ error: 'Not found' }, 404);

      const rows = students
        .map((s: Record<string, any>) => ({
          course_id,
          student_name: (s.student_name || '').trim(),
          email: (s.email || '').trim() || null,
          section_id: section_id || s.section_id || null,
        }))
        .filter((s) => s.student_name);

      if (rows.length === 0) return json({ error: 'No usable rows found - every line needs at least a name.' }, 400);

      // Replacing rather than appending is what makes re-uploading a corrected
      // CSV the obvious fix for a typo. But when a section is named, only THAT
      // section is replaced - otherwise uploading period 2 would silently
      // delete period 1, which is exactly what a teacher doing one class at a
      // time would least expect.
      let del = admin.from('roster_students').delete().eq('course_id', course_id);
      del = section_id ? del.eq('section_id', section_id) : del;
      const { error: delErr } = await del;
      if (delErr) return json({ error: delErr.message }, 500);

      const { data, error } = await admin.from('roster_students').insert(rows).select();
      if (error) return json({ error: error.message }, 500);
      return json({ results: data || [] });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
