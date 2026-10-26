import JSZip from "jszip";

function safeName(s) {
  return (s || "").trim().replace(/[^A-Za-z0-9_-]+/g, "_") || "student";
}

function htmlToPlainText(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent?.trim() || "";
}

function describeCheck(tc, harnessType, methodName) {
  const pts = typeof tc.points === "number" ? ` (${tc.points} pt${tc.points === 1 ? "" : "s"})` : "";
  // Hidden checks: the label only. Their inputs/expected output stay out of the
  // zip, same as they stay out of what a student is shown.
  if (tc.hidden) return `- ${tc.label || "(unlabeled)"}${pts} [hidden check - details withheld]`;
  const lines = [`- ${tc.label || "(unlabeled)"}${pts}`];
  if (harnessType === "program_output") {
    if (tc.stdin) lines.push(`  - input: ${JSON.stringify(tc.stdin)}`);
    if (tc.expected_output != null && tc.expected_output !== "") {
      lines.push(`  - ${tc.check_kind === "output_contains" ? "output contains" : "expected output"}: ${JSON.stringify(tc.expected_output)}`);
    }
  } else {
    if (Array.isArray(tc.method_args)) lines.push(`  - ${methodName}(${tc.method_args.join(", ")})`);
    if (tc.expected_output != null && tc.expected_output !== "") lines.push(`  - expected: ${tc.expected_output}`);
    if (tc.check_kind) lines.push(`  - check: ${tc.check_kind}${tc.param != null ? ` ${tc.param}` : ""}`);
  }
  return lines.join("\n");
}

// Builds the zip a teacher hands to Claude for a pre-grading walkthrough of a
// Coding Assignment: the problem + answer key up front, then one folder per
// student with only their final code. Unlike the Project export there is no
// rubric or review prompt - the CLAUDE.md tells Claude to work interactively,
// one student at a time, answering the teacher's questions.
export async function exportCodingForReview(problem, submissions) {
  const zip = new JSZip();
  const className = (problem.class_name || "Solution").trim() || "Solution";
  const description = htmlToPlainText(problem.description_html) || "(no description)";
  const keyNotes = htmlToPlainText(problem.answer_key_notes_html);
  const hasKey = !!(problem.answer_key_code || "").trim();
  const hasStarter = !!(problem.starter_code || "").trim();
  const samples = (problem.sample_outputs || []).filter((s) => s.kind === "text" && (s.text || "").trim());

  const methodsText = (problem.methods || [])
    .map((m) => {
      const head =
        m.harness_type === "program_output"
          ? `### Whole program (reads input / prints output)`
          : `### Method \`${m.method_name}\``;
      const checks = (m.test_cases || []).map((tc) => describeCheck(tc, m.harness_type, m.method_name)).join("\n");
      return `${head}\n${checks || "(no checks)"}`;
    })
    .join("\n\n");

  const problemMd =
    `# ${problem.title}\n\n` +
    (problem.points_possible != null ? `Worth ${problem.points_possible} points.\n\n` : "") +
    `## Description\n${description}\n\n` +
    (samples.length ? `## Sample output\n${samples.map((s) => "```\n" + s.text.trim() + "\n```").join("\n\n")}\n\n` : "") +
    `## Autograder checks\n${methodsText || "(none)"}\n`;

  zip.file(
    "CLAUDE.md",
    `# ${problem.title} — Pre-grading walkthrough\n\n` +
      `I'm the teacher. This folder holds one Java assignment and every student's final submitted code. ` +
      `I'm using it BEFORE grading, to look through the work with you and ask questions.\n\n` +
      `## How to work with me\n` +
      `1. **First, study the problem, not the students.** Read \`problem.md\`` +
      (hasKey ? `, \`answer_key/\`` : "") +
      (hasStarter ? ` and \`starter/\`` : "") +
      `. Think about what a correct solution needs, the common ways to get it wrong, and what ` +
      `the autograder checks vs. what it cannot see. Give me a SHORT summary of that (a few bullets), ` +
      `then ask which section of the code I want help looking at.\n` +
      `2. **Then go one student at a time**, in folder order (\`submissions/\`). For each, say whose ` +
      `it is, ask what I want to look at (or offer a brief overview if I just say "go"), and answer my ` +
      `questions about their code. Stay on that student until I say to move on.\n` +
      `3. **Don't move to the next student, or write grades/comments, unless I ask.** ` +
      `Don't summarize the whole class unless I ask.\n` +
      `4. Be concrete: quote the lines you mean. If something is a style or logic problem versus a real ` +
      `bug, say which. If you're unsure whether code works, say so rather than guessing.\n\n` +
      `## Layout\n` +
      `- \`problem.md\` — description, sample output, and the autograder's checks (hidden checks show only their labels)\n` +
      (hasKey ? `- \`answer_key/\` — the teacher's reference solution${keyNotes ? " and notes" : ""}\n` : "") +
      (hasStarter ? `- \`starter/\` — the starter code every student was given. Don't count it as the student's own work.\n` : "") +
      `- \`submissions/\` — one folder per student: their final \`${className}.java\` and a \`_meta.json\` ` +
      `(name, submission time, autograder score, whether they disclosed using an AI chatbot)\n` +
      `- \`roster.csv\` — everyone who submitted\n`
  );
  zip.file("problem.md", problemMd);
  if (hasKey) {
    const key = zip.folder("answer_key");
    key.file(`${className}.java`, problem.answer_key_code);
    if (keyNotes) key.file("notes.md", keyNotes);
  }
  if (hasStarter) zip.folder("starter").file(`${className}.java`, problem.starter_code);

  const rows = ["name,submitted_at,autograde_score,ai_help_used"];
  const toField = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const folderOf = zip.folder("submissions");
  submissions.forEach((s, i) => {
    const folder = folderOf.folder(`${String(i + 1).padStart(2, "0")}-${safeName(s.student_name)}`);
    folder.file(`${className}.java`, s.code || "// (turned in without any code)\n");
    folder.file(
      "_meta.json",
      JSON.stringify(
        {
          student_name: s.student_name,
          submitted_at: s.submitted_at,
          autograde_score: s.autograde_score ?? s.score ?? null,
          points_possible: problem.points_possible ?? null,
          ai_help_used: s.ai_help_used ?? null,
          ai_help_link: s.ai_help_link ?? null,
        },
        null,
        2
      )
    );
    rows.push([s.student_name, s.submitted_at, s.autograde_score ?? s.score ?? "", s.ai_help_used ?? ""].map(toField).join(","));
  });
  zip.file("roster.csv", rows.join("\n"));

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName(problem.title).toLowerCase()}-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
