// Builds server/seed.json: real autopsies of the founder's own dormant repos.
// node scripts/seed.mjs   (needs ANTHROPIC_API_KEY; SELLER = the founder's wallet)
import fs from 'node:fs';
import { repoFacts } from '../server/github.mjs';
import { autopsy, vitals } from '../server/autopsy.mjs';

const SELLER = process.env.SELLER;
const GRAVES = [
  { repo: 'neromtoobad/gameweek', price: 900, includes: ['Repo', 'Verified Base mainnet contracts', '10 kit artworks', '64 tests'],
    note: 'The wallet holding the first round\'s float became unreachable before round one opened. The contracts are live and verified on Base mainnet; no round was ever played.' },
  { repo: 'neromtoobad/vial', price: 400, includes: ['Repo', 'Live site', 'Contracts'],
    note: 'Built for a hackathon, then I entered a different project instead. It never got a single user.' },
  { repo: 'neromtoobad/demorun', price: 450, includes: ['Repo', 'Video pipeline'], note: '' },
  { repo: 'neromtoobad/koso', price: 250, includes: ['Repo', 'Live game', 'Character art'],
    note: 'Made in a day for a games jam. The judges never saw it because I submitted a different game.' },
  { repo: 'neromtoobad/delphi-duel', price: 300, includes: ['Repo', 'Agent prompts'], note: '' },
  { repo: 'neromtoobad/doom', price: 350, includes: ['Repo', 'Live site', 'Cairo contracts'], note: '' },
  { repo: 'neromtoobad/chogstack', price: 150, includes: ['Repo', 'Trait renderer'],
    note: 'Retired. I stopped liking where it was going.' },
  { repo: 'neromtoobad/suiiiiiii-beats', price: 200, includes: ['Repo', 'Live site', 'Move package'], note: '' },
  { repo: 'neromtoobad/receipts', price: 300, includes: ['Repo', 'Agent league logic'], note: '' },
];

const out = [];
const results = await Promise.all(GRAVES.map(async (g) => {
  const facts = await repoFacts(g.repo);
  if (!facts) { console.error('missing', g.repo); return null; }
  const report = await autopsy(facts, g.note);
  console.error('done', g.repo, report.model, report.vitality, report.priceLow, report.priceHigh);
  return { g, facts, report };
}));
for (const r of results.filter(Boolean)) {
  const { g, facts, report } = r;
  out.push({
    id: facts.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    name: facts.name.replace(/-+$/, ''),
    tagline: (facts.description || '').slice(0, 140),
    repo: facts.repo,
    liveUrl: facts.homepage || '',
    seller: SELLER,
    sellerNote: g.note,
    price: g.price,
    includes: g.includes,
    facts,
    vitals: vitals(facts),
    report,
    proof: 'founder',
    status: 'resting',
    deal: null,
    history: [],
    createdAt: new Date(Date.now() - Math.random() * 4 * 86400_000).toISOString(),
  });
}
fs.writeFileSync(new URL('../server/seed.json', import.meta.url), JSON.stringify(out, null, 1));
console.error('wrote', out.length);
