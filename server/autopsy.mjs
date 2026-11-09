// The autopsy: read a dead repo's facts, have Claude write the coroner's report.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const MODEL = process.env.AUTOPSY_MODEL || 'claude-opus-5-5';
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const Report = z.object({
  causeOfDeath: z.string().describe('One plain sentence: why this project most likely stopped. Specific to the evidence.'),
  epitaph: z.string().describe('A short tombstone line, 4 to 10 words, wry but kind. No quotes, no emoji.'),
  diagnosis: z.array(z.string()).describe('Exactly 3 short findings from the evidence (what exists, how complete, what is missing).'),
  salvage: z.array(z.string()).describe('2 to 4 concrete assets a new owner gets (e.g. working contract, auth flow, design system, domain).'),
  revivalPlan: z
    .array(z.object({ when: z.string().describe('e.g. Day 1, Week 1, Month 1'), step: z.string() }))
    .describe('Exactly 3 steps a new owner should take to bring it back.'),
  adopter: z.string().describe('Who should adopt this, in one sentence.'),
  vitality: z.number().int().describe('0-100: how revivable it is. 100 = works today, just needs an owner.'),
  priceLow: z.number().int().describe('Fair low asking price in USD for the code + assets as-is.'),
  priceHigh: z.number().int().describe('Fair high asking price in USD.'),
});

const SYSTEM = `You are the coroner at Graveyard Shift, a marketplace where builders hand off side projects they stopped working on.
You write a short, honest autopsy of a project from its GitHub facts and README, for someone deciding whether to adopt it.
Be concrete and grounded in the evidence given; never invent users, revenue or traction that the evidence does not show.
Prices are for small vibecoded projects: most land between $50 and $2,000. A polished app with contracts deployed and a live URL sits at the top; a half-built prototype at the bottom.`;

const days = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));

export function vitals(f) {
  return {
    born: f.createdAt,
    died: f.lastCommitAt,
    daysDead: days(f.lastCommitAt),
    lifespanDays: Math.max(1, Math.round((new Date(f.lastCommitAt) - new Date(f.createdAt)) / 86_400_000)),
  };
}

function evidence(f, note) {
  const v = vitals(f);
  return [
    `Repo: ${f.repo}${f.archived ? ' (archived)' : ''}`,
    `Description: ${f.description || '(none)'}`,
    `Live URL: ${f.homepage || '(none listed)'}`,
    `Created ${f.createdAt.slice(0, 10)}, last commit ${f.lastCommitAt.slice(0, 10)} (${v.daysDead} days ago), ${f.commitCount} commits over ${v.lifespanDays} days`,
    `Stars ${f.stars}, forks ${f.forks}, open issues ${f.issues}, size ${f.sizeKb} KB, license ${f.license || 'none'}`,
    `Languages: ${f.languages.map((l) => `${l.name} ${l.pct}%`).join(', ') || 'unknown'}`,
    f.topics.length ? `Topics: ${f.topics.join(', ')}` : '',
    note ? `Seller's own note on why it stopped: ${note}` : '',
    `README (truncated):\n${f.readme || '(no README)'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** A plain rule-based report, used when Claude is unavailable. */
function fallback(f, note) {
  const v = vitals(f);
  const top = f.languages[0]?.name || 'code';
  const live = Boolean(f.homepage);
  const vitality = Math.max(10, Math.min(95, (live ? 40 : 15) + Math.min(30, f.commitCount) + (v.daysDead < 60 ? 20 : 0)));
  return {
    causeOfDeath: note || `Development stopped ${v.daysDead} days ago after ${f.commitCount} commits; no owner has picked it up since.`,
    epitaph: live ? 'Still answers the door, nobody home' : 'Shipped to the repo, never to the world',
    diagnosis: [
      `${f.commitCount} commits over ${v.lifespanDays} days, mostly ${top}.`,
      live ? `A live URL is listed (${f.homepage}).` : 'No live URL is listed.',
      f.readme ? 'Has a README describing the idea.' : 'No README, so the idea lives only in the code.',
    ],
    salvage: [`${top} codebase`, live ? 'Live deployment' : 'Working prototype', f.readme ? 'Written product brief (README)' : 'Repo history'],
    revivalPlan: [
      { when: 'Day 1', step: 'Clone it, get it running locally, and redeploy under your own accounts.' },
      { when: 'Week 1', step: 'Fix the rough edges the README admits to and ship one visible improvement.' },
      { when: 'Month 1', step: 'Put it in front of 20 real users and decide whether it lives.' },
    ],
    adopter: `A builder comfortable in ${top} who wants a head start instead of a blank repo.`,
    vitality,
    priceLow: live ? 150 : 50,
    priceHigh: live ? 600 : 250,
    model: 'rules',
  };
}

export async function autopsy(facts, note = '') {
  if (!client) return fallback(facts, note);
  const params = {
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'low', format: betaZodOutputFormat(Report) },
    messages: [{ role: 'user', content: `Write the autopsy for this project.\n\n${evidence(facts, note)}` }],
  };
  try {
    let res;
    try {
      // Server-side refusal fallback: if the model declines, the API re-runs on a fallback model in the same call.
      res = await client.beta.messages.parse({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    } catch (e) {
      if (e?.status !== 400) throw e;
      res = await client.beta.messages.parse(params);
    }
    if (res.stop_reason === 'refusal' || !res.parsed_output) return fallback(facts, note);
    const out = res.parsed_output;
    out.vitality = Math.max(0, Math.min(100, out.vitality));
    if (out.priceHigh < out.priceLow) [out.priceLow, out.priceHigh] = [out.priceHigh, out.priceLow];
    return { ...out, model: res.model || MODEL };
  } catch (e) {
    console.error('autopsy failed, using rules:', e?.status || '', e?.message);
    return fallback(facts, note);
  }
}
