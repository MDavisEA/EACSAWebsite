import { supabase } from '@/api/supabaseClient';
import { getSessionAuthMethod } from '@/lib/sessionAuthMethod';
import { ALLOWED_STUDENT_DOMAIN } from '@/lib/schoolConfig';

// ============================================================================
// This file replaces the old @base44/sdk client. Every page/component in the
// app calls `base44.entities.X.method(...)`, `base44.auth.method(...)`, etc.
// exactly as before - none of that calling code changed. This file is the
// ONLY place that knows Base44 is gone and Supabase Edge Functions are doing
// the actual work now.
//
// Two things this shim manages that the old app didn't have to think about:
//  1. Attaching the teacher's auth token to teacher-only actions.
//  2. Caching each student submission's session_token in localStorage, and
//     using it to prove ownership on every subsequent read/write. See
//     MIGRATION_GUIDE.md for why, and for the one UX trade-off this implies.
// ============================================================================

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function hasActiveTeacherSession() {
  const { data } = await supabase.auth.getSession();
  // A Supabase session alone no longer implies "teacher" now that students
  // also get real sessions via Google sign-in. Teachers authenticate with
  // email/password (Landing.jsx), students via Google OAuth - checking how
  // THIS session was established (via the token's amr claim, not the
  // account's overall app_metadata.provider) stays correct even if the same
  // account ends up with both an email/password and a Google identity linked
  // (e.g. a teacher testing the student flow with their own school email).
  return getSessionAuthMethod(data?.session) === 'password';
}

async function callFunction(name, body) {
  const headers = await authHeader();
  const { data, error } = await supabase.functions.invoke(name, { body, headers });
  if (error) {
    // supabase-js only gives a generic "non-2xx status code" message by
    // default - the actual { error: "..." } body our functions return is
    // parked on error.context (a Response), so unwrap it when present.
    if (error.context?.json) {
      let parsed;
      try {
        parsed = await error.context.json();
      } catch {
        // body wasn't JSON - fall through to the generic error below
      }
      if (parsed?.error) throw new Error(parsed.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// ---- localStorage helper for the legacy (pre-Google-sign-in) session-token
// cache. Nothing writes new entries here anymore - this only still reads
// entries an old anonymous submission cached before sign-in was required. ----

const tokenKeyById = (submissionId) => `sub_token_by_id::${submissionId}`;

function readCachedTokenById(submissionId) {
  try {
    const raw = localStorage.getItem(tokenKeyById(submissionId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Translates Base44-style sort strings ("-created_date") into the
// {column, ascending} shape the edge functions expect.
function parseSort(sortString) {
  if (!sortString) return undefined;
  const ascending = !sortString.startsWith('-');
  const rawColumn = sortString.replace(/^-/, '');
  const columnMap = { created_date: 'created_at', updated_date: 'updated_at' };
  return { column: columnMap[rawColumn] || rawColumn, ascending };
}

// ============================================================================
// entities.Assignment
// ============================================================================

const Assignment = {
  async filter(criteria = {}, sort) {
    const keys = Object.keys(criteria).sort().join(',');

    if (keys === 'id') {
      const data = await callFunction('assignments', { action: 'examGet', id: criteria.id });
      return data.results;
    }

    if (keys === 'featured,is_active') {
      const data = await callFunction('assignments', { action: 'listFeatured' });
      return data.results;
    }

    throw new Error(`Assignment.filter: unsupported criteria shape {${keys}}`);
  },

  async list(sort) {
    // Same call site is used by the teacher dashboard (needs full data,
    // requires login) AND by the public "check my score" page (needs the
    // answer-key-gated version, no login). Whichever is true right now in
    // this browser decides which one we call.
    if (await hasActiveTeacherSession()) {
      const data = await callFunction('assignments', { action: 'list', sort: parseSort(sort) });
      return data.results;
    }
    const data = await callFunction('assignments', { action: 'scoreLookupList' });
    return data.results;
  },

  async create(fields) {
    const data = await callFunction('assignments', { action: 'create', data: fields });
    return data.result;
  },

  async update(id, fields) {
    const data = await callFunction('assignments', { action: 'update', id, data: fields });
    return data.result;
  },

  async delete(id) {
    await callFunction('assignments', { action: 'delete', id });
  },
};

// ============================================================================
// entities.Submission
// ============================================================================

const Submission = {
  async create(fields) {
    // Sign-in is required to start new work now, so identity comes from the
    // caller's Google JWT (attached by authHeader() inside callFunction) -
    // the server derives student_name/student_user_id from that, not from
    // anything passed here. No localStorage token caching needed either:
    // ownership of the resulting submission is proven by the JWT itself.
    if (fields.coding_problem_id) {
      const data = await callFunction('submissions', {
        action: 'startCoding',
        coding_problem_id: fields.coding_problem_id,
      });
      return data.result;
    }
    const data = await callFunction('submissions', {
      action: 'startFresh',
      assignment_id: fields.assignment_id,
      initial_responses: fields.responses,
    });
    return data.result;
  },

  async filter(criteria = {}, sort) {
    const keys = Object.keys(criteria).sort().join(',');

    if (
      (keys === 'assignment_id,submitted' || keys === 'coding_problem_id,submitted') &&
      criteria.submitted === false
    ) {
      const data = await callFunction('submissions', {
        action: 'findMyOpenSubmission',
        assignment_id: criteria.assignment_id,
        coding_problem_id: criteria.coding_problem_id,
      });
      return data.result ? [data.result] : [];
    }

    if (keys === 'access_code,submitted' && criteria.submitted === true) {
      const data = await callFunction('submissions', { action: 'getByAccessCode', access_code: criteria.access_code });
      return data.results;
    }

    if (keys === 'mine,submitted' && criteria.mine === true && criteria.submitted === true) {
      const data = await callFunction('submissions', { action: 'myScores' });
      return data.results;
    }

    if (
      (keys === 'assignment_id,submitted' || keys === 'coding_problem_id,submitted' || keys === 'project_id,submitted') &&
      criteria.submitted === true
    ) {
      const data = await callFunction('submissions', {
        action: 'listForAssignment',
        assignment_id: criteria.assignment_id,
        coding_problem_id: criteria.coding_problem_id,
        project_id: criteria.project_id,
        sort: parseSort(sort),
      });
      return data.results;
    }

    if (keys === 'submitted' && criteria.submitted === true) {
      const data = await callFunction('submissions', { action: 'listAllSubmitted' });
      return data.results;
    }

    throw new Error(`Submission.filter: unsupported criteria shape {${keys}}`);
  },

  // { byAssignment: {id: n}, byProject: {id: n} } - submitted work with no
  // score yet, i.e. what is waiting on the teacher.
  async gradingCounts() {
    const data = await callFunction('submissions', { action: 'gradingCounts' });
    return data.result;
  },

  async update(id, fields) {
    if (await hasActiveTeacherSession()) {
      if ('access_code' in fields && Object.keys(fields).length === 1) {
        const data = await callFunction('submissions', { action: 'setAccessCode', submission_id: id, access_code: fields.access_code });
        return data.result;
      }
      const data = await callFunction('submissions', { action: 'saveGrade', submission_id: id, ...fields });
      return data.result;
    }

    // Student path. Ownership is normally proven by the caller's Google JWT
    // (attached automatically via authHeader()). The cached session_token is
    // only a fallback, for anonymous submissions started before sign-in was
    // required - it's harmlessly ignored server-side for anything owned by
    // an authenticated student.
    const cached = readCachedTokenById(id);
    const sessionToken = cached?.session_token || '';
    if (fields.submitted === true) {
      const data = await callFunction('submissions', {
        action: 'submitFinal',
        submission_id: id,
        session_token: sessionToken,
        responses: fields.responses,
        time_spent_seconds: fields.time_spent_seconds,
      });
      return data.result;
    }
    const data = await callFunction('submissions', {
      action: 'saveResponses',
      submission_id: id,
      session_token: sessionToken,
      responses: fields.responses,
    });
    return data.result;
  },

  async delete(id) {
    await callFunction('submissions', { action: 'delete', submission_id: id });
  },

  // Project submissions are a single "fetch the gist's .java files and
  // snapshot them" action rather than an in-browser editor session, so they
  // don't fit the create/filter/update shape above - two dedicated methods
  // instead.
  async submitGist(project_id, gist_url) {
    const data = await callFunction('submissions', { action: 'submitProject', project_id, gist_url });
    return data.result;
  },

  async getMyProjectSubmission(project_id) {
    const data = await callFunction('submissions', { action: 'myProjectSubmission', project_id });
    return data.result;
  },

  // Teacher-only: seed a project's submissions from a name,gist_url list -
  // no student sign-in needed. Returns a per-row {student_name, status,
  // error?} so the caller can show which ones failed and why.
  async bulkImportProject(project_id, rows) {
    const data = await callFunction('submissions', { action: 'bulkImportProject', project_id, rows });
    return data.results;
  },

  // Teacher-only: re-check whether any submitted gist has been edited since
  // it was snapshotted. Returns per-submission {status, current_updated_at}.
  async recheckGists(project_id) {
    const data = await callFunction('submissions', { action: 'recheckGists', project_id });
    return data.results;
  },
};

// ============================================================================
// entities.CodingProblem (new - for the autograding UI, built on the same
// shim pattern as everything above)
// ============================================================================

const CodingProblem = {
  async filter(criteria = {}) {
    const keys = Object.keys(criteria).sort().join(',');
    if (keys === 'is_active' && criteria.is_active === true) {
      const data = await callFunction('coding-problems', { action: 'listActive' });
      return data.results;
    }
    if (keys === 'id') {
      const data = await callFunction('coding-problems', { action: 'getActive', id: criteria.id });
      return data.result ? [data.result] : [];
    }
    throw new Error(`CodingProblem.filter: unsupported criteria shape {${keys}}`);
  },

  async list() {
    const data = await callFunction('coding-problems', { action: 'list' });
    return data.results;
  },

  // Exactly what a student would be served, for the teacher's preview -
  // works on inactive problems too, unlike the student-facing fetch.
  async previewAsStudent(id) {
    const data = await callFunction('coding-problems', { action: 'previewAsStudent', id });
    return data.result;
  },

  async create(fields) {
    const data = await callFunction('coding-problems', { action: 'create', data: fields });
    return data.result;
  },

  async update(id, fields) {
    const data = await callFunction('coding-problems', { action: 'update', id, data: fields });
    return data.result;
  },

  async delete(id) {
    await callFunction('coding-problems', { action: 'delete', id });
  },
};

// ============================================================================
// entities.Project (big assignments turned in as a gist link, reviewed
// against a rubric with an AI assistant rather than autograded)
// ============================================================================

const Project = {
  async filter(criteria = {}) {
    const keys = Object.keys(criteria).sort().join(',');
    if (keys === 'is_active' && criteria.is_active === true) {
      const data = await callFunction('projects', { action: 'listActive' });
      return data.results;
    }
    if (keys === 'id') {
      const data = await callFunction('projects', { action: 'getActive', id: criteria.id });
      return data.result ? [data.result] : [];
    }
    throw new Error(`Project.filter: unsupported criteria shape {${keys}}`);
  },

  async list() {
    const data = await callFunction('projects', { action: 'list' });
    return data.results;
  },

  async create(fields) {
    const data = await callFunction('projects', { action: 'create', data: fields });
    return data.result;
  },

  async update(id, fields) {
    const data = await callFunction('projects', { action: 'update', id, data: fields });
    return data.result;
  },

  async delete(id) {
    await callFunction('projects', { action: 'delete', id });
  },

  // Lets the teacher populate starter code from a gist in the project form,
  // reusing the same gist-fetch action a student's own submission uses.
  async fetchStarterGist(gist_url) {
    const data = await callFunction('projects', { action: 'fetchStarterGist', gist_url });
    return data.result;
  },

  // Live text of a project's Google Doc, for the review export - fetched
  // server-side to sidestep CORS (see the edge function for why).
  async fetchGoogleDocText(google_doc_url) {
    const data = await callFunction('projects', { action: 'fetchGoogleDocText', google_doc_url });
    return data.result;
  },
};

// ============================================================================
// entities.Course (class rosters - exist so the teacher can see who has NOT
// turned work in; entirely teacher-facing, never exposed to students)
// ============================================================================

const Course = {
  async list() {
    const data = await callFunction('courses', { action: 'list' });
    return data.results;
  },

  async create(fields) {
    const data = await callFunction('courses', { action: 'create', data: fields });
    return data.result;
  },

  async update(id, fields) {
    const data = await callFunction('courses', { action: 'update', id, data: fields });
    return data.result;
  },

  async delete(id) {
    await callFunction('courses', { action: 'delete', id });
  },

  async listRoster(course_id) {
    const data = await callFunction('courses', { action: 'listRoster', course_id });
    return data.results;
  },

  // Replaces the whole roster rather than appending, so re-uploading a
  // corrected CSV is the natural way to fix a mistake.
  async replaceRoster(course_id, students) {
    const data = await callFunction('courses', { action: 'replaceRoster', course_id, students });
    return data.results;
  },
};

// ============================================================================
// entities.StudentWork - the signed-in student's own dashboard. Its own
// namespace rather than a Submission method because it spans all three work
// types plus their submissions, and returns a narrow summary shape rather
// than any one entity.
// ============================================================================

const StudentWork = {
  async myAssignedWork() {
    const data = await callFunction('student-work', { action: 'myAssignedWork' });
    return { items: data.results, studentName: data.student_name };
  },
};

// ============================================================================
// auth (teacher login)
// ============================================================================

const auth = {
  async me() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) throw new Error('Not authenticated');
    return data.user;
  },

  async logout(redirectUrl) {
    await supabase.auth.signOut();
    if (redirectUrl) window.location.href = redirectUrl;
  },

  redirectToLogin() {
    window.location.href = '/';
  },

  // Students sign in with their school Google account instead of creating a
  // password. `hd` is a hint to Google's login screen (pre-fills/restricts
  // to that Workspace domain) - it is NOT the real security boundary, which
  // is enforced server-side in every Edge Function via getStudentFromRequest
  // checking the email domain on the verified JWT.
  async signInWithGoogle(redirectTo) {
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo || window.location.href,
        queryParams: { hd: ALLOWED_STUDENT_DOMAIN, prompt: 'select_account' },
      },
    });
  },
};

// ============================================================================
// integrations.Core.UploadFile
// ============================================================================

const integrations = {
  Core: {
    async UploadFile({ file }) {
      const headers = await authHeader();
      const formData = new FormData();
      formData.append('file', file);
      const { data, error } = await supabase.functions.invoke('upload-file', { body: formData, headers });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { file_url: data.file_url };
    },
  },
};

// ============================================================================
// functions.invoke (generic - used for extractPdfText, runJavaTests)
// ============================================================================

const FUNCTION_NAME_MAP = {
  extractPdfText: 'extract-pdf-text',
  runJavaTests: 'run-java-tests',
};

const functions = {
  async invoke(name, payload) {
    const endpoint = FUNCTION_NAME_MAP[name] || name;
    const data = await callFunction(endpoint, payload);
    return { data }; // matches the axios-style `.data` shape the old SDK used
  },
};

export const base44 = {
  entities: { Assignment, Submission, CodingProblem, Project, Course, StudentWork },
  auth,
  integrations,
  functions,
};
