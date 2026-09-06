// Roster CSV parsing. Accepts either "Name" per line, or "Name,email" -
// email is optional but strongly preferred, because Google sign-in gives us
// the student's email and matching on that is exact, where matching on names
// breaks the moment Google says "Matthew Davis" and the roster says "Matt".
//
// Tolerates a header row (a first line whose fields look like column names
// rather than data) so exporting from a gradebook and pasting it in works.

const HEADER_WORDS = ["name", "student", "student name", "email", "e-mail", "address"];

function looksLikeHeader(fields) {
  return fields.every((f) => HEADER_WORDS.includes(f.trim().toLowerCase()));
}

// A plain `line.split(",")` leaves quotes in verbatim - a gradebook export
// that quotes every field regardless of content (`"Bradica Logan",email@…`)
// came through with the quotes still on the name - and would mis-split a
// "Last, First" name that is quoted specifically because it contains a
// comma (`"Logan, Bradica"`). Handles both: a comma inside a quoted field is
// part of the field, not a separator, and a doubled `""` inside quotes is an
// escaped literal quote.
function splitCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

export function parseRosterCsv(text) {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows = lines.map((line) => {
    const parts = splitCsvLine(line);
    // Anything that looks like an email goes in the email slot regardless of
    // column order, so "email,name" pastes work too.
    const emailIdx = parts.findIndex((p) => p.includes("@"));
    if (emailIdx === -1) return { student_name: parts[0] || "", email: "" };
    const name = parts.filter((_, i) => i !== emailIdx).join(" ").trim();
    return { student_name: name, email: parts[emailIdx] };
  });

  if (rows.length > 0 && looksLikeHeader(splitCsvLine(lines[0]))) rows.shift();

  return rows.filter((r) => r.student_name);
}

// Normalized for matching - Google's display name and a hand-typed roster
// name differ in case and spacing more often than in substance.
export function normalizeName(name) {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

// Given a course roster and the submissions for a project, works out who is
// missing. Matches on email first (exact, from Google sign-in), falling back
// to a normalized name comparison for bulk-imported rows that never had an
// email attached.
export function diffRosterAgainstSubmissions(roster, submissions) {
  const submittedEmails = new Set(
    submissions.map((s) => normalizeEmail(s.student_email)).filter(Boolean)
  );
  const submittedNames = new Set(submissions.map((s) => normalizeName(s.student_name)).filter(Boolean));

  const missing = roster.filter((r) => {
    if (r.email && submittedEmails.has(normalizeEmail(r.email))) return false;
    if (submittedNames.has(normalizeName(r.student_name))) return false;
    return true;
  });

  const rosterEmails = new Set(roster.map((r) => normalizeEmail(r.email)).filter(Boolean));
  const rosterNames = new Set(roster.map((r) => normalizeName(r.student_name)).filter(Boolean));

  // Submissions that match nobody on the roster - a student who transferred
  // in, a name typo, or a roster that is out of date. Surfaced rather than
  // silently dropped, since "unmatched" usually means the roster needs fixing.
  const unmatched = submissions.filter((s) => {
    const email = normalizeEmail(s.student_email);
    if (email && rosterEmails.has(email)) return false;
    return !rosterNames.has(normalizeName(s.student_name));
  });

  return { missing, unmatched };
}
