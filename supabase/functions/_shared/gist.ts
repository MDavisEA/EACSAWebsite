// Shared between submissions/index.ts (a student's own gist, fetched at
// submit time) and projects/index.ts (a teacher's starter-code gist, fetched
// when building a project) - same GitHub Gist API, same .java-only filter.

// Accepts a full gist URL or a bare gist id.
export function extractGistId(url: string): string | null {
  const m = url.trim().match(/gist\.github\.com\/[^/]+\/([0-9a-f]+)/i);
  if (m) return m[1];
  const bare = url.trim().replace(/\/+$/, '');
  return /^[0-9a-f]{20,}$/i.test(bare) ? bare : null;
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'User-Agent': 'ap-csa-practice' };
  const token = Deno.env.get('GITHUB_TOKEN');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// Metadata-only variant for the "was this edited after it was turned in?"
// check - skips pulling file bodies, since only updated_at is needed.
export async function fetchGistUpdatedAt(
  gistId: string
): Promise<{ updatedAt: string | null } | { error: string }> {
  const resp = await fetch(`https://api.github.com/gists/${gistId}`, { headers: githubHeaders() });
  if (resp.status === 404) return { error: 'Gist no longer exists or was made private.' };
  if (resp.status === 403) return { error: 'GitHub rate-limited this request.' };
  if (!resp.ok) return { error: `GitHub returned an error (${resp.status}).` };
  const data = await resp.json();
  return { updatedAt: data.updated_at ?? null };
}

// Fetches a public gist's .java files server-side. Uses GITHUB_TOKEN if set
// (raises the rate limit from 60/hr to 5,000/hr; no scopes needed for
// reading public gists) - falls back to unauthenticated if not configured.
export async function fetchGistJavaFiles(
  gistId: string
): Promise<{ files: { filename: string; content: string }[]; gistUpdatedAt: string | null } | { error: string }> {
  const resp = await fetch(`https://api.github.com/gists/${gistId}`, { headers: githubHeaders() });
  if (resp.status === 404) return { error: "That gist wasn't found - check the URL and make sure it's not private." };
  if (resp.status === 403) return { error: 'GitHub rate-limited this request. Please try again in a few minutes.' };
  if (!resp.ok) return { error: `GitHub returned an error (${resp.status}) fetching that gist.` };

  const data = await resp.json();
  const files: { filename: string; content: string }[] = [];
  for (const [filename, meta] of Object.entries<any>(data.files || {})) {
    if (!filename.toLowerCase().endsWith('.java')) continue;
    if (meta.truncated || meta.content == null) {
      const rawResp = await fetch(meta.raw_url, { headers: { 'User-Agent': 'ap-csa-practice' } });
      files.push({ filename, content: await rawResp.text() });
    } else {
      files.push({ filename, content: meta.content });
    }
  }
  if (files.length === 0) {
    return { error: 'No .java files found in that gist - check the URL and make sure the gist is public.' };
  }
  return { files, gistUpdatedAt: data.updated_at ?? null };
}
