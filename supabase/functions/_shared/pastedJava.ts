// A Java Project turned in (or test-run) by pasting code instead of linking a
// gist. The result has the same { filename, content } shape fetchGistJavaFiles
// returns, so everything downstream (grading views, line comments, the review
// export, the teacher's driver) treats it exactly like a snapshotted gist.
// Shared by submissions (submitProject) and run-java-tests (project_driver).

export const MAX_PASTED_FILES = 12;
export const MAX_PASTED_FILE_CHARS = 300_000;

export function validatePastedJavaFiles(
  raw: unknown
): { files: { filename: string; content: string }[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'Paste your code first.' };
  if (raw.length > MAX_PASTED_FILES) return { error: `At most ${MAX_PASTED_FILES} files.` };
  const files: { filename: string; content: string }[] = [];
  const seen = new Set<string>();
  for (const f of raw) {
    const filename = typeof f?.filename === 'string' ? f.filename.trim() : '';
    const content = typeof f?.content === 'string' ? f.content : '';
    if (!/^[A-Za-z_][A-Za-z0-9_]*\.java$/.test(filename)) {
      return { error: `"${filename || '(blank)'}" isn't a valid file name. Use the class name, like Main.java.` };
    }
    if (seen.has(filename.toLowerCase())) return { error: `Two files are named ${filename}.` };
    seen.add(filename.toLowerCase());
    if (!content.trim()) return { error: `${filename} is empty.` };
    if (content.length > MAX_PASTED_FILE_CHARS) return { error: `${filename} is too long.` };
    files.push({ filename, content });
  }
  return { files };
}
