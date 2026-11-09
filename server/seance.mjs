// Séance: the launchpad half. Relays launches, indexes trades, and keeps each spirit's heartbeat.
import { parseAbi, decodeEventLog, getAddress } from 'viem';
import { pub, wallet, serial, listingKey } from './chain.mjs';
import * as store from './store.mjs';
import { latestCommit } from './github.mjs';

export const SEANCE = process.env.SEANCE_ADDRESS || '';
export const RISE_AT = 1500;
export const HEARTBEAT_DAYS = 30;
export const seanceReady = () => Boolean(SEANCE);

export const seanceAbi = parseAbi([
  'function launch(bytes32 listing, address founder, string name, string symbol) returns (uint256)',
  'function buy(uint256 id, uint256 usdcIn, uint256 minOut) returns (uint256)',
  'function sell(uint256 id, uint256 tokensIn, uint256 minOut) returns (uint256)',
  'function pulse(uint256 id)',
  'function setFounder(uint256 id, address founder)',
  'function claim(uint256 id) returns (uint256)',
  'function launchCount() view returns (uint256)',
  'function launchOf(bytes32) view returns (uint256)',
  'function quoteBuy(uint256 id, uint256 usdcIn) view returns (uint256)',
  'function quoteSell(uint256 id, uint256 tokensIn) view returns (uint256)',
  'function info(uint256 id) view returns ((bytes32 listing, address token, address founder, uint40 createdAt, uint40 lastPulse, uint40 risenAt, uint128 reserve, uint128 pot) l, uint256 supply, uint256 priceE18, bool alive)',
  'event Launched(uint256 indexed id, bytes32 indexed listing, address token, address founder, string symbol)',
  'event Trade(uint256 indexed id, address indexed trader, bool isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 reserve, uint256 supply)',
  'event Risen(uint256 indexed id, uint256 reserve)',
  'event Pulse(uint256 indexed id, uint40 at)',
  'event Claimed(uint256 indexed id, address founder, uint256 amount)',
  'event FounderChanged(uint256 indexed id, address founder)',
]);

async function write(functionName, args) {
  if (!wallet) throw new Error('no verifier key');
  return serial(async () => {
    let hash;
    try {
      hash = await wallet.writeContract({ address: SEANCE, abi: seanceAbi, functionName, args });
    } catch (e) {
      if (!/nonce/i.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 2500));
      hash = await wallet.writeContract({ address: SEANCE, abi: seanceAbi, functionName, args });
    }
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
    if (receipt.status !== 'success') throw new Error(`${functionName} reverted`);
    return { hash, receipt };
  });
}

export const raiseMessage = ({ repo, symbol, founder }) =>
  `Graveyard Shift\nI am raising ${repo} from the dead as $${symbol}.\nFounder: ${founder}`;

/** Founder seat for a plot: the seller, or the adopter once the handover went through. */
export const founderOf = (p) => (p.status === 'adopted' && p.deal?.buyer ? p.deal.buyer : p.seller);

export async function launchSpirit(p, symbol) {
  const founder = getAddress(founderOf(p));
  const { hash, receipt } = await write('launch', [listingKey(p.id), founder, p.name, symbol]);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== SEANCE.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: seanceAbi, data: log.data, topics: log.topics });
      if (ev.eventName === 'Launched') {
        const spirit = {
          id: Number(ev.args.id),
          token: ev.args.token,
          symbol,
          founder,
          launchedAt: new Date().toISOString(),
          launchTx: hash,
          trades: [],
          holders: {},
          pulses: [],
        };
        store.log('raised', { plot: p.id, symbol, founder });
        return store.updatePlot(p.id, { spirit });
      }
    } catch {}
  }
  throw new Error('Launch event missing');
}

// ------------------------------------------------------------ live reads

const infoCache = new Map();
export async function liveInfo(spiritId) {
  const hit = infoCache.get(spiritId);
  if (hit && Date.now() - hit.at < 8000) return hit.v;
  const [l, supply, priceE18, alive] = await pub.readContract({ address: SEANCE, abi: seanceAbi, functionName: 'info', args: [BigInt(spiritId)] });
  const v = {
    founder: l.founder,
    reserve: Number(l.reserve) / 1e6,
    pot: Number(l.pot) / 1e6,
    supply: Number(supply / 10n ** 12n) / 1e6, // whole tokens
    price: Number(priceE18 / 10n ** 12n) / 1e12, // USDC per whole token
    alive,
    risenAt: Number(l.risenAt) || null,
    lastPulse: Number(l.lastPulse) || null,
    createdAt: Number(l.createdAt),
  };
  v.progress = Math.min(1, v.reserve / RISE_AT);
  v.marketCap = v.price * 1e9; // fully diluted at the curve's 1B virtual supply
  infoCache.set(spiritId, { at: Date.now(), v });
  return v;
}
export const forget = (spiritId) => infoCache.delete(spiritId);

// ------------------------------------------------------------ trade indexer

const byId = () => {
  const m = new Map();
  for (const p of store.plots()) if (p.spirit) m.set(p.spirit.id, p);
  return m;
};

let indexing = null;
export function indexTrades() {
  if (!seanceReady()) return Promise.resolve();
  indexing ||= (async () => {
    try {
      const head = await pub.getBlockNumber();
      let from = BigInt(store.meta('seanceCursor') ?? Number(head) - 150);
      const plots = byId();
      // the public Base RPC caps eth_getLogs at 200 blocks; walk in small steps, at most ~40 per tick
      for (let step = 0; from <= head && step < 40; step++) {
        const to = from + 190n > head ? head : from + 190n;
        const logs = await pub.getLogs({ address: SEANCE, fromBlock: from, toBlock: to });
        for (const log of logs) {
          let ev;
          try {
            ev = decodeEventLog({ abi: seanceAbi, data: log.data, topics: log.topics });
          } catch {
            continue;
          }
          const p = plots.get(Number(ev.args.id));
          if (!p) continue;
          const s = p.spirit;
          const key = `${log.transactionHash}:${log.logIndex}`;
          if (ev.eventName === 'Trade') {
            if (s.trades.some((t) => t.key === key)) continue;
            const usd = Number(ev.args.usdcAmount) / 1e6;
            const tokens = Number(ev.args.tokenAmount / 10n ** 12n) / 1e6;
            const who = ev.args.trader;
            s.trades.unshift({ key, who, buy: ev.args.isBuy, usd, tokens, tx: log.transactionHash, block: Number(log.blockNumber), at: new Date().toISOString() });
            s.trades = s.trades.slice(0, 200);
            s.holders[who] = Math.max(0, (s.holders[who] || 0) + (ev.args.isBuy ? tokens : -tokens));
            if (s.holders[who] < 1e-6) delete s.holders[who];
            store.log(ev.args.isBuy ? 'candle' : 'snuffed', { plot: p.id, symbol: s.symbol, who, usd: Math.round(usd * 100) / 100 });
          } else if (ev.eventName === 'Risen') {
            s.risenAt ||= new Date().toISOString();
            store.log('risen', { plot: p.id, symbol: s.symbol });
          } else if (ev.eventName === 'Claimed') {
            store.log('claimed', { plot: p.id, symbol: s.symbol, usd: Number(ev.args.amount) / 1e6 });
          } else if (ev.eventName === 'FounderChanged') {
            s.founder = ev.args.founder;
          }
          forget(s.id);
          store.updatePlot(p.id, { spirit: s });
        }
        from = to + 1n;
        store.setMeta('seanceCursor', Number(from));
      }
    } catch (e) {
      console.error('indexer', e.shortMessage || e.message);
    } finally {
      indexing = null;
    }
  })();
  return indexing;
}

// ------------------------------------------------------------ heartbeat

/** A new commit after launch (or after the last pulse) is a heartbeat: tell the contract. */
export async function heartbeat(p) {
  const s = p.spirit;
  if (!s) return;
  const c = await latestCommit(p.repo).catch(() => null);
  if (!c?.at) return;
  const after = s.lastPulseCommitAt || s.launchedAt;
  if (new Date(c.at) <= new Date(after) || c.sha === s.lastPulseSha) return;
  const { hash } = await write('pulse', [BigInt(s.id)]);
  s.lastPulseCommitAt = c.at;
  s.lastPulseSha = c.sha;
  s.pulses = [{ at: new Date().toISOString(), commitAt: c.at, sha: c.sha, tx: hash }, ...(s.pulses || [])].slice(0, 30);
  forget(s.id);
  store.updatePlot(p.id, { spirit: s });
  store.log('pulse', { plot: p.id, symbol: s.symbol, sha: c.sha.slice(0, 7) });
}

/** On adoption, the adopter inherits the founder seat (and the pot). */
export async function handFounderSeat(p) {
  const s = p.spirit;
  if (!s || !p.deal?.buyer) return;
  if (s.founder?.toLowerCase() === p.deal.buyer.toLowerCase()) return;
  await write('setFounder', [BigInt(s.id), getAddress(p.deal.buyer)]);
  s.founder = getAddress(p.deal.buyer);
  forget(s.id);
  store.updatePlot(p.id, { spirit: s });
  store.log('seat', { plot: p.id, symbol: s.symbol, founder: s.founder });
}
