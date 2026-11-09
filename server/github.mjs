// Public GitHub reads, cached. Unauthenticated works (60 req/h); GITHUB_TOKEN raises the ceiling.
const cache = new Map();
const TTL = 30 * 60 * 1000;

function headers(extra = {}) {
  const h = { 'User-Agent': 'graveyard-shift', Accept: 'application/vnd.github+json', ...extra };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function gh(path, { raw = false, ttl = TTL, fresh = false } = {}) {
  const k = `${raw}:${path}`;
  const hit = cache.get(k);
  if (!fresh && hit && Date.now() - hit.at < ttl) return hit.v;
  const res = await fetch(`https://api.github.com${path}`, {
    headers: headers(raw ? { Accept: 'application/vnd.github.raw' } : {}),
    redirect: 'follow',
  });
  if (res.status === 404) {
    cache.set(k, { at: Date.now(), v: null });
    return null;
  }
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  const v = raw ? await res.text() : { body: await res.json(), link: res.headers.get('link') };
  cache.set(k, { at: Date.now(), v });
  return v;
}

/** "https://github.com/a/b", "github.com/a/b.git", "a/b" -> "a/b" */
export function parseRepo(input = '') {
  const s = String(input).trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const m = s.match(/(?:github\.com\/)?([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export async function repoFacts(repo) {
  const r = await gh(`/repos/${repo}`);
  if (!r) return null;
  const b = r.body;
  const [langs, commits, readme] = await Promise.all([
    gh(`/repos/${repo}/languages`).catch(() => null),
    gh(`/repos/${repo}/commits?per_page=1`).catch(() => null),
    gh(`/repos/${repo}/readme`, { raw: true }).catch(() => null),
  ]);
  let commitCount = commits?.body?.length || 0;
  const last = commits?.link?.match(/[?&]page=(\d+)>; rel="last"/);
  if (last) commitCount = Number(last[1]);
  const langBytes = langs?.body || {};
  const total = Object.values(langBytes).reduce((a, n) => a + n, 0) || 1;
  const languages = Object.entries(langBytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, n]) => ({ name, pct: Math.round((n / total) * 100) }));
  const lastCommitAt = commits?.body?.[0]?.commit?.committer?.date || b.pushed_at;
  return {
    repo: b.full_name,
    owner: b.owner?.login,
    name: b.name,
    description: b.description || '',
    homepage: b.homepage || '',
    private: b.private,
    archived: b.archived,
    stars: b.stargazers_count,
    forks: b.forks_count,
    issues: b.open_issues_count,
    sizeKb: b.size,
    topics: b.topics || [],
    license: b.license?.spdx_id || null,
    createdAt: b.created_at,
    pushedAt: b.pushed_at,
    lastCommitAt,
    commitCount,
    languages,
    readme: (readme || '').slice(0, 6000),
  };
}

/** Who owns this repo right now? GitHub redirects transferred repos, so the old path still resolves. */
export async function currentOwner(repo) {
  try {
    const r = await gh(`/repos/${repo}`, { fresh: true });
    if (r) return r.body.owner?.login;
  } catch {}
  // API limited: github.com itself redirects a transferred repo's old URL to its new owner.
  let url = `https://github.com/${repo}`;
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': 'graveyard-shift' } });
    if (res.status === 200) return new URL(url).pathname.split('/')[1];
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url).toString();
      continue;
    }
    return null;
  }
  return null;
}

/** Proof of ownership: a `.graveyard` file (or the README) in the repo mentions the seller's address. */
export async function ownershipProof(repo, address) {
  const want = address.toLowerCase();
  const file = await gh(`/repos/${repo}/contents/.graveyard`, { raw: true, fresh: true }).catch(() => null);
  if (file && file.toLowerCase().includes(want)) return 'file';
  const readme = await gh(`/repos/${repo}/readme`, { raw: true, fresh: true }).catch(() => null);
  if (readme && readme.toLowerCase().includes(want)) return 'readme';
  return null;
}

/** Date of the newest commit on the default branch (cached ~10 min, so the heartbeat stays cheap). */
export async function latestCommit(repo) {
  const r = await gh(`/repos/${repo}/commits?per_page=1`, { ttl: 10 * 60 * 1000 });
  const c = r?.body?.[0];
  return c ? { sha: c.sha, at: c.commit?.committer?.date || c.commit?.author?.date } : null;
}
