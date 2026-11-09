import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAddress, isAddress } from 'viem';
import './env.mjs';
import * as store from './store.mjs';
import { repoFacts, parseRepo, currentOwner, ownershipProof } from './github.mjs';
import { autopsy, vitals } from './autopsy.mjs';
import * as chain from './chain.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(here, '..', 'web', 'dist');
const PORT = Number(process.env.PORT || 8787);

// ------------------------------------------------------------ helpers

const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};
const fail = (res, code, error) => send(res, code, { error });

async function body(req) {
  let raw = '';
  for await (const c of req) {
    raw += c;
    if (raw.length > 200_000) throw new Error('too large');
  }
  return raw ? JSON.parse(raw) : {};
}

const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return true;
  arr.push(now);
  hits.set(key, arr);
  return false;
}
const ipOf = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

export const buryMessage = ({ repo, seller, price }) =>
  `Graveyard Shift\nI am burying ${repo} and offering it for adoption.\nSeller: ${seller}\nAsking: ${price} USDC`;

const publicPlot = (p) => {
  const { facts, ...rest } = p;
  const { readme, ...f } = facts || {};
  return { ...rest, facts: f, listingKey: chain.listingKey(p.id) };
};

// Autopsies are cached so the report the seller saw is the one that gets listed.
const autopsies = new Map();
async function runAutopsy(repo, note = '') {
  const k = `${repo.toLowerCase()}|${note}`;
  const hit = autopsies.get(k);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.v;
  const facts = await repoFacts(repo);
  if (!facts) return null;
  if (facts.private) throw Object.assign(new Error('That repo is private. Graveyard Shift reads public repos only.'), { code: 400 });
  const report = await autopsy(facts, note);
  const v = { facts, vitals: vitals(facts), report };
  autopsies.set(k, { at: Date.now(), v });
  return v;
}

// ------------------------------------------------------------ deal sync + keeper

async function sync(p, { checkTransfer = true } = {}) {
  if (!p?.deal || !chain.ready()) return p;
  const d = await chain.readDeal(p.deal.id);
  if (d.state === 'released' && p.status !== 'adopted') {
    store.log('released', { plot: p.id, deal: p.deal.id });
    return store.updatePlot(p.id, { status: 'adopted', deal: { ...p.deal, state: 'released', settledAt: new Date().toISOString() } });
  }
  if (d.state === 'refunded') {
    store.log('refunded', { plot: p.id, deal: p.deal.id });
    return store.updatePlot(p.id, {
      status: 'resting',
      deal: null,
      history: [...(p.history || []), { ...p.deal, state: 'refunded', settledAt: new Date().toISOString() }],
    });
  }
  if (d.state === 'funded' && checkTransfer && p.deal.buyerGithub) {
    const owner = await currentOwner(p.repo).catch(() => null);
    const patch = { deal: { ...p.deal, lastCheck: new Date().toISOString(), ownerSeen: owner } };
    if (owner && owner.toLowerCase() === p.deal.buyerGithub.toLowerCase()) {
      const tx = await chain.attest(p.deal.id);
      store.log('attested', { plot: p.id, deal: p.deal.id, owner, tx });
      return store.updatePlot(p.id, {
        status: 'adopted',
        deal: { ...patch.deal, state: 'released', releaseTx: tx, releasedBy: 'verifier', settledAt: new Date().toISOString() },
      });
    }
    return store.updatePlot(p.id, patch);
  }
  return p;
}

let keeping = false;
async function keeper() {
  if (keeping) return;
  keeping = true;
  try {
    for (const p of store.plots().filter((x) => x.status === 'pending')) {
      await sync(p).catch((e) => console.error('keeper', p.id, e.message));
    }
  } finally {
    keeping = false;
  }
}
setInterval(keeper, 75_000);

// ------------------------------------------------------------ routes

const routes = {
  'GET /api/config': async () => ({
    chainId: 84532,
    graveyard: chain.GRAVEYARD,
    gusd: chain.GUSD,
    explorer: chain.EXPLORER,
    verifier: chain.account?.address || null,
    handoverWindow: 3 * 86400,
  }),

  'GET /api/plots': async () => ({ plots: store.plots().map(publicPlot) }),

  'GET /api/stats': async () => {
    const all = store.plots();
    const escrow = await chain.escrowTotals().catch(() => null);
    return {
      resting: all.filter((p) => p.status === 'resting').length,
      pending: all.filter((p) => p.status === 'pending').length,
      adopted: all.filter((p) => p.status === 'adopted').length,
      asking: all.filter((p) => p.status === 'resting').reduce((a, p) => a + p.price, 0),
      escrow,
    };
  },

  'GET /api/events': async () => ({ events: store.events().slice(0, 40) }),

  'POST /api/autopsy': async (req) => {
    if (limited(`autopsy:${ipOf(req)}`, 12, 3600_000)) throw Object.assign(new Error('The coroner needs a break. Try again in a bit.'), { code: 429 });
    const { repo: input, note = '' } = await body(req);
    const repo = parseRepo(input);
    if (!repo) throw Object.assign(new Error('Paste a public GitHub repo, like github.com/you/project'), { code: 400 });
    const out = await runAutopsy(repo, String(note).slice(0, 400));
    if (!out) throw Object.assign(new Error(`Couldn't find ${repo} on GitHub. Is it public?`), { code: 404 });
    const existing = store.plots().find((p) => p.repo.toLowerCase() === out.facts.repo.toLowerCase() && p.status !== 'adopted');
    const { readme, ...facts } = out.facts;
    return { ...out, facts, existing: existing?.id || null };
  },

  'POST /api/plots': async (req) => {
    const b = await body(req);
    const repo = parseRepo(b.repo);
    if (!repo) throw Object.assign(new Error('Missing repo'), { code: 400 });
    if (!isAddress(b.seller || '')) throw Object.assign(new Error('Connect a wallet first'), { code: 400 });
    const seller = getAddress(b.seller);
    const price = Math.round(Number(b.price));
    if (!(price >= 1 && price <= 50_000)) throw Object.assign(new Error('Asking price must be between 1 and 50,000 USDC'), { code: 400 });
    const message = buryMessage({ repo, seller, price });
    if (!(await chain.verifySignature(seller, message, b.signature))) throw Object.assign(new Error('Signature did not match the seller wallet'), { code: 401 });
    const note = String(b.note || '').slice(0, 400);
    const out = await runAutopsy(repo, note);
    if (!out) throw Object.assign(new Error('Repo not found'), { code: 404 });
    if (store.plots().some((p) => p.repo.toLowerCase() === out.facts.repo.toLowerCase() && p.status !== 'adopted'))
      throw Object.assign(new Error('That project is already in the graveyard'), { code: 409 });
    const p = store.addPlot({
      id: store.slugify(b.name || out.facts.name),
      name: String(b.name || out.facts.name).slice(0, 60),
      tagline: String(b.tagline || out.facts.description || '').slice(0, 140),
      repo: out.facts.repo,
      liveUrl: String(b.liveUrl || out.facts.homepage || '').slice(0, 200),
      seller,
      sellerNote: note,
      price,
      includes: (Array.isArray(b.includes) ? b.includes : []).map((s) => String(s).slice(0, 40)).slice(0, 6),
      facts: out.facts,
      vitals: out.vitals,
      report: out.report,
      proof: null,
      status: 'resting',
      deal: null,
      history: [],
      signature: b.signature,
      createdAt: new Date().toISOString(),
    });
    store.log('buried', { plot: p.id, seller, price });
    ownershipProof(p.repo, seller).then((proof) => proof && store.updatePlot(p.id, { proof })).catch(() => {});
    return { plot: publicPlot(p) };
  },
};

async function plotRoute(method, id, action, req) {
  const p = store.plot(id);
  if (!p) throw Object.assign(new Error('No such plot'), { code: 404 });

  if (method === 'GET' && !action) {
    const fresh = p.status === 'pending' ? await sync(p, { checkTransfer: false }).catch(() => p) : p;
    return { plot: publicPlot(fresh) };
  }

  if (method === 'POST' && action === 'proof') {
    const proof = await ownershipProof(p.repo, p.seller);
    if (proof) store.updatePlot(id, { proof });
    return { proof: proof || p.proof || null };
  }

  if (method === 'POST' && action === 'adopt') {
    const b = await body(req);
    if (!/^0x[0-9a-fA-F]{64}$/.test(b.txHash || '')) throw Object.assign(new Error('Bad tx hash'), { code: 400 });
    const gh = String(b.buyerGithub || '').replace(/^@/, '').trim();
    if (!/^[A-Za-z0-9-]{1,39}$/.test(gh)) throw Object.assign(new Error('Enter the GitHub username the repo should go to'), { code: 400 });
    const a = await chain.adoptionFromTx(b.txHash);
    if (!a) throw Object.assign(new Error('No adoption found in that transaction'), { code: 400 });
    if (a.listing !== chain.listingKey(id)) throw Object.assign(new Error('That deal is for a different plot'), { code: 400 });
    if (a.seller.toLowerCase() !== p.seller.toLowerCase()) throw Object.assign(new Error('Deal pays the wrong seller'), { code: 400 });
    if (a.amount + 1e-9 < p.price) throw Object.assign(new Error('Deal is below the asking price'), { code: 400 });
    const deal = { id: a.dealId, buyer: a.buyer, buyerGithub: gh, amount: a.amount, deadline: a.deadline, txHash: b.txHash, openedAt: new Date().toISOString(), state: 'funded' };
    store.log('adopted', { plot: id, deal: a.dealId, buyer: a.buyer, amount: a.amount });
    return { plot: publicPlot(store.updatePlot(id, { status: 'pending', deal })) };
  }

  if (method === 'POST' && action === 'check') {
    if (limited(`check:${id}`, 6, 60_000)) throw Object.assign(new Error('Checked just now. Give GitHub a moment.'), { code: 429 });
    return { plot: publicPlot(await sync(p)) };
  }

  throw Object.assign(new Error('Not found'), { code: 404 });
}

async function faucet(req) {
  const { address } = await body(req);
  if (!isAddress(address || '')) throw Object.assign(new Error('Connect a wallet first'), { code: 400 });
  if (limited(`faucet:${address.toLowerCase()}`, 2, 12 * 3600_000) || limited(`faucetip:${ipOf(req)}`, 6, 24 * 3600_000))
    throw Object.assign(new Error('You already got test funds. Come back later.'), { code: 429 });
  const out = await chain.drip(address);
  store.log('faucet', { address });
  return out;
}

// ------------------------------------------------------------ static

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json', '.mp3': 'audio/mpeg' };
function serveStatic(req, res) {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST, url);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) return fail(res, 404, 'build the web app first');
  const ext = path.extname(file);
  res.writeHead(200, {
    'content-type': TYPES[ext] || 'application/octet-stream',
    'cache-control': url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

// ------------------------------------------------------------ server

http
  .createServer(async (req, res) => {
    const [pathname] = req.url.split('?');
    try {
      if (!pathname.startsWith('/api/')) return serveStatic(req, res);
      const key = `${req.method} ${pathname}`;
      if (routes[key]) return send(res, 200, await routes[key](req));
      if (key === 'POST /api/faucet') return send(res, 200, await faucet(req));
      const m = pathname.match(/^\/api\/plots\/([a-z0-9-]+)(?:\/([a-z]+))?$/);
      if (m) return send(res, 200, await plotRoute(req.method, m[1], m[2], req));
      fail(res, 404, 'Not found');
    } catch (e) {
      const code = e.code && Number.isInteger(e.code) ? e.code : 500;
      if (code >= 500) console.error(req.method, pathname, e);
      fail(res, code, code >= 500 ? (e.shortMessage || e.message || 'Server error') : e.message);
    }
  })
  .listen(PORT, () => console.log(`graveyard shift on :${PORT} · escrow ${chain.GRAVEYARD || '(not set)'} · verifier ${chain.account?.address || '(none)'}`));
