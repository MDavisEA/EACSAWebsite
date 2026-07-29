import JSZip from "jszip";

function safeName(s) {
  return (s || "").trim().replace(/[^A-Za-z0-9_-]+/g, "_") || "student";
}

function htmlToPlainText(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent?.trim() || "";
}

function toCsvField(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Builds the zip a teacher hands to Claude/Cowork for a project review pass.
// CLAUDE.md is the load-bearing file - Claude Code and Cowork both read it
// automatically when pointed at a folder, so the rubric and review
// instructions don't need to be re-typed every time.
export async function exportProjectForReview(project, submissions) {
  const zip = new JSZip();
  const assignmentText = htmlToPlainText(project.description_html);
  const rubric = project.rubric_md || "(no rubric set)";
  const reviewPrompt = project.review_prompt || "Review each submission against the rubric.";

  zip.file(
    "CLAUDE.md",
    `# ${project.title} — Review Pass\n\n` +
      `## What I want from you\n${reviewPrompt}\n\n` +
      `## Rubric\n${rubric}\n\n` +
      `## Assignment\n${assignmentText || "(no description)"}\n\n` +
      `## Layout\n` +
      `- \`submissions/\` — one folder per student, containing their .java files\n` +
      `- \`_meta.json\` in each folder — gist URL and submission time\n` +
      `- \`roster.csv\` — every student who submitted, for cross-reference\n`
  );
  zip.file("rubric.md", rubric);
  zip.file("assignment.md", assignmentText || "(no description)");

  const rosterRows = ["name,submitted_at,gist_url,file_count"];
  const submissionsFolder = zip.folder("submissions");

  submissions.forEach((s, i) => {
    const folderName = `${String(i + 1).padStart(2, "0")}-${safeName(s.student_name)}`;
    const folder = submissionsFolder.folder(folderName);
    (s.files || []).forEach((f) => folder.file(f.filename, f.content));
    folder.file(
      "_meta.json",
      JSON.stringify(
        {
          student_name: s.student_name,
          gist_url: s.gist_url,
          submitted_at: s.submitted_at,
          gist_captured_at: s.gist_captured_at,
        },
        null,
        2
      )
    );
    rosterRows.push(
      [s.student_name, s.submitted_at, s.gist_url, (s.files || []).length].map(toCsvField).join(",")
    );
  });

  zip.file("roster.csv", rosterRows.join("\n"));

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName(project.title).toLowerCase()}-${dateStamp}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
