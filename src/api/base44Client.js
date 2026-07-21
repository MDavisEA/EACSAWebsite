import { supabase } from '@/api/supabaseClient';

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
  return !!data?.session;
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

// ---- localStorage helpers for the submission session-token cache ----

const tokenKeyByAssignment = (parentId, studentName) => `sub_token::${parentId}::${studentName}`;
const tokenKeyById = (submissionId) => `sub_token_by_id::${submissionId}`;

function cacheToken(parentId, studentName, submission) {
  const cached = JSON.stringify({ id: submission.id, session_token: submission.session_token });
  try {
    localStorage.setItem(tokenKeyByAssignment(parentId, studentName), cached);
    localStorage.setItem(tokenKeyById(submission.id), cached);
  } catch {
    // localStorage can throw in some locked-down browser contexts - the
    // session still works within the current page load, it just won't
    // survive a refresh. Not fatal.
  }
}

function readCachedTokenByAssignment(parentId, studentName) {
  try {
    const raw = localStorage.getItem(tokenKeyByAssignment(parentId, studentName));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

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
    if (fields.coding_problem_id) {
      const parentId = fields.coding_problem_id;
      const data = await callFunction('submissions', {
        action: 'startCoding',
        coding_problem_id: parentId,
        student_name: fields.student_name,
      });
      cacheToken(parentId, fields.student_name, data.result);
      return data.result;
    }
    const parentId = fields.assignment_id;
    const data = await callFunction('submissions', {
      action: 'startFresh',
      assignment_id: fields.assignment_id,
      student_name: fields.student_name,
      initial_responses: fields.responses,
    });
    cacheToken(parentId, fields.student_name, data.result);
    return data.result;
  },

  async filter(criteria = {}, sort) {
    const keys = Object.keys(criteria).sort().join(',');

    if (
      (keys === 'assignment_id,student_name,submitted' || keys === 'coding_problem_id,student_name,submitted') &&
      criteria.submitted === false
    ) {
      const parentId = criteria.assignment_id || criteria.coding_problem_id;
      const cached = readCachedTokenByAssignment(parentId, criteria.student_name);
      if (!cached) return []; // no local record - caller will create fresh
      const data = await callFunction('submissions', {
        action: 'resume',
        submission_id: cached.id,
        session_token: cached.session_token,
      });
      return data.result ? [data.result] : [];
    }

    if (keys === 'access_code,submitted' && criteria.submitted === true) {
      const data = await callFunction('submissions', { action: 'getByAccessCode', access_code: criteria.access_code });
      return data.results;
    }

    if (
      (keys === 'assignment_id,submitted' || keys === 'coding_problem_id,submitted') &&
      criteria.submitted === true
    ) {
      const data = await callFunction('submissions', {
        action: 'listForAssignment',
        assignment_id: criteria.assignment_id,
        coding_problem_id: criteria.coding_problem_id,
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

  async update(id, fields) {
    if (await hasActiveTeacherSession()) {
      if ('access_code' in fields && Object.keys(fields).length === 1) {
        const data = await callFunction('submissions', { action: 'setAccessCode', submission_id: id, access_code: fields.access_code });
        return data.result;
      }
      const data = await callFunction('submissions', { action: 'saveGrade', submission_id: id, ...fields });
      return data.result;
    }

    // Student path - needs the cached session token for this submission.
    const cached = readCachedTokenById(id);
    if (!cached) {
      throw new Error(
        'No local session found for this submission (cleared storage or a different device). Refresh and start the assignment again.'
      );
    }
    if (fields.submitted === true) {
      const data = await callFunction('submissions', {
        action: 'submitFinal',
        submission_id: id,
        session_token: cached.session_token,
        responses: fields.responses,
        time_spent_seconds: fields.time_spent_seconds,
      });
      return data.result;
    }
    const data = await callFunction('submissions', {
      action: 'saveResponses',
      submission_id: id,
      session_token: cached.session_token,
      responses: fields.responses,
    });
    return data.result;
  },

  async delete(id) {
    await callFunction('submissions', { action: 'delete', submission_id: id });
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
  entities: { Assignment, Submission, CodingProblem },
  auth,
  integrations,
  functions,
};
