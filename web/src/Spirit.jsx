import React, { useMemo, useState } from 'react';
import { useAccount, useConfig, useReadContract, useSignMessage, useSwitchChain } from 'wagmi';
import { getWalletClient, readContract, waitForTransactionReceipt } from 'wagmi/actions';
import { encodeFunctionData, parseAbi } from 'viem';
import { api, gusdAbi, usd, short, ago, CHAIN } from './lib.js';
import { Stone } from './Tombstone.jsx';
import { useGusd, Faucet } from './Wallet.jsx';
import { usePoll } from './App.jsx';

export const seanceAbi = parseAbi([
  'function buy(uint256 id, uint256 usdcIn, uint256 minOut) returns (uint256)',
  'function sell(uint256 id, uint256 tokensIn, uint256 minOut) returns (uint256)',
  'function claim(uint256 id) returns (uint256)',
  'function quoteBuy(uint256 id, uint256 usdcIn) view returns (uint256)',
  'function quoteSell(uint256 id, uint256 tokensIn) view returns (uint256)',
]);
const spiritAbi = parseAbi(['function balanceOf(address) view returns (uint256)']);

export const raiseMessage = ({ repo, symbol, founder }) =>
  `Graveyard Shift\nI am raising ${repo} from the dead as $${symbol}.\nFounder: ${founder}`;

export const founderOf = (p) => (p.status === 'adopted' && p.deal?.buyer ? p.deal.buyer : p.seller);

/** Tiny prices read better with significant digits than with fixed decimals. */
export const px = (n) => (n >= 0.01 ? `$${n.toFixed(4)}` : `$${Number(n || 0).toPrecision(3)}`);
export const compact = (n) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);

function useTx(config) {
  const { address, chainId, connector } = useAccount();
  const wcfg = useConfig();
  const { switchChainAsync } = useSwitchChain();
  const wallet = async () => {
    if (chainId !== CHAIN.id) await switchChainAsync({ chainId: CHAIN.id });
    return getWalletClient(wcfg, { chainId: CHAIN.id });
  };
  const wait = (hash) => waitForTransactionReceipt(wcfg, { hash, chainId: CHAIN.id });
  /** approve (if needed) + call, as one atomic bundle on a Base Account */
  const withApproval = async (amount, data, setBusy) => {
    const wc = await wallet();
    if (connector?.id === 'baseAccount') {
      setBusy('sign');
      const { id } = await wc.sendCalls({
        calls: [
          { to: config.gusd, data: encodeFunctionData({ abi: gusdAbi, functionName: 'approve', args: [config.seance, amount] }) },
          { to: config.seance, data },
        ],
      });
      setBusy('confirming');
      const st = await wc.waitForCallsStatus({ id, timeout: 120_000 });
      if (st.status !== 'success') throw new Error('The bundle did not go through');
      return;
    }
    const allowance = await readContract(wcfg, { address: config.gusd, abi: gusdAbi, functionName: 'allowance', args: [address, config.seance], chainId: CHAIN.id });
    if (allowance < amount) {
      setBusy('approve');
      await wait(await wc.writeContract({ address: config.gusd, abi: gusdAbi, functionName: 'approve', args: [config.seance, amount] }));
    }
    setBusy('sign');
    const hash = await wc.sendTransaction({ to: config.seance, data });
    setBusy('confirming');
    await wait(hash);
  };
  const send = async (data, setBusy) => {
    const wc = await wallet();
    setBusy('sign');
    const hash = await wc.sendTransaction({ to: config.seance, data });
    setBusy('confirming');
    await wait(hash);
  };
  return { address, withApproval, send };
}

// ------------------------------------------------------------ plot page panel

export function SpiritPanel({ plot: p, config, onChange }) {
  if (!config?.seance) return null;
  return p.spirit ? <Raised p={p} config={config} onChange={onChange} /> : <Unraised p={p} onChange={onChange} />;
}

function Unraised({ p, onChange }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [symbol, setSymbol] = useState(() => p.name.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase());
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const founder = founderOf(p);
  const isFounder = address && address.toLowerCase() === founder.toLowerCase();

  const raise = async () => {
    setErr('');
    try {
      const sym = symbol.replace(/^\$/, '').toUpperCase();
      if (!/^[A-Z0-9]{2,8}$/.test(sym)) throw new Error('Ticker: 2 to 8 letters or digits');
      setBusy('sign');
      const signature = await signMessageAsync({ message: raiseMessage({ repo: p.repo, symbol: sym, founder: address }) });
      setBusy('raise');
      await api(`/plots/${p.id}/raise`, { body: { symbol: sym, founder: address, signature } });
      onChange();
    } catch (e) {
      setErr((e.shortMessage || e.message).split('\n')[0]);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="spirit-card unraised">
      <span className="k"><Wisp /> Project token</span>
      {isFounder ? (
        <>
          <h3>Launch a token for it</h3>
          <p className="muted small">
            Launch <b>{p.name}</b> as a token on a bonding curve. No presale, no team allocation. 2% of every trade goes into a founder pot that you
            can withdraw once the token reaches its 1,500 USDC goal, and only while the repo has a commit in the last 30 days.
          </p>
          <label className="field ticker">
            <span>Ticker</span>
            <div><i>$</i><input value={symbol} maxLength={8} onChange={(e) => setSymbol(e.target.value.toUpperCase())} /></div>
          </label>
          <button className="btn primary wide" onClick={raise} disabled={!!busy}>
            {busy === 'sign' ? 'Sign in your wallet…' : busy === 'raise' ? 'Launching…' : `Launch $${symbol || '…'}`}
          </button>
          <p className="muted small">One signature. We cover the gas.</p>
        </>
      ) : (
        <>
          <h3>No token yet</h3>
          <p className="muted small">
            The seller of {p.name} can launch it as a token. Supporters buy in on a bonding curve, and the founder only earns while they keep shipping.
          </p>
          <a className="link small" href="#/seance">How project tokens work →</a>
        </>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}

function Raised({ p, config, onChange }) {
  const s = p.spirit;
  const tx = useTx(config);
  const { balance, refetch } = useGusd(config);
  const [tab, setTab] = useState('buy');
  const [amt, setAmt] = useState('50');
  const [pct, setPct] = useState(100);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const me = tx.address?.toLowerCase();
  const isFounder = me && me === s.founder?.toLowerCase();

  const bal = useReadContract({
    address: s.token,
    abi: spiritAbi,
    functionName: 'balanceOf',
    args: tx.address ? [tx.address] : undefined,
    chainId: CHAIN.id,
    query: { enabled: Boolean(tx.address), refetchInterval: 15_000 },
  });
  const held = bal.data ?? 0n;
  const usdIn = BigInt(Math.max(0, Math.round(Number(amt || 0) * 1e6)));
  const tokensIn = (held * BigInt(pct)) / 100n;
  const qb = useReadContract({ address: config.seance, abi: seanceAbi, functionName: 'quoteBuy', args: [BigInt(s.id), usdIn], chainId: CHAIN.id, query: { enabled: tab === 'buy' && usdIn > 0n } });
  const qs = useReadContract({ address: config.seance, abi: seanceAbi, functionName: 'quoteSell', args: [BigInt(s.id), tokensIn], chainId: CHAIN.id, query: { enabled: tab === 'sell' && tokensIn > 0n } });

  const after = async () => {
    await api(`/plots/${p.id}/spirit`, { body: {} }).catch(() => {});
    bal.refetch();
    refetch();
    onChange();
  };
  const run = async (fn) => {
    setErr('');
    try {
      await fn();
      setBusy('recording');
      await after();
    } catch (e) {
      setErr((e.shortMessage || e.message || 'Failed').split('\n')[0]);
    } finally {
      setBusy('');
    }
  };

  const buy = () =>
    run(async () => {
      if (usdIn <= 0n) throw new Error('Enter an amount');
      const min = ((qb.data ?? 0n) * 97n) / 100n;
      await tx.withApproval(usdIn, encodeFunctionData({ abi: seanceAbi, functionName: 'buy', args: [BigInt(s.id), usdIn, min] }), setBusy);
    });
  const sell = () =>
    run(async () => {
      if (tokensIn <= 0n) throw new Error("You don't hold any of this token");
      const min = ((qs.data ?? 0n) * 97n) / 100n;
      await tx.send(encodeFunctionData({ abi: seanceAbi, functionName: 'sell', args: [BigInt(s.id), tokensIn, min] }), setBusy);
    });
  const claim = () => run(() => tx.send(encodeFunctionData({ abi: seanceAbi, functionName: 'claim', args: [BigInt(s.id)] }), setBusy));

  const risen = Boolean(s.risenAt);
  const short_ = tab === 'buy' && balance != null && balance < Number(amt || 0);
  const label = { approve: 'Approve USDC in your wallet…', sign: 'Confirm in your wallet…', confirming: 'Waiting for Base…', recording: 'Recording…' }[busy];
  const heldN = Number(held / 10n ** 12n) / 1e6;

  return (
    <div className={`spirit-card ${risen ? 'is-risen' : ''}`}>
      <div className="spirit-head">
        <span className="k"><Wisp /> Project token</span>
        <span className={`chip ${risen ? 'risen' : ''}`}>{risen ? 'Goal reached' : 'Funding'}</span>
      </div>
      <h3 className="ticker-big">${s.symbol}</h3>

      <div className="rise-bar" title={`${usd(s.reserve)} of ${usd(config.riseAt)} USDC in the curve`}>
        <i style={{ width: `${Math.max(2, (s.progress || 0) * 100)}%` }} />
      </div>
      <p className="muted small rise-label">
        {risen ? <>Goal reached: {usd(s.reserve)} USDC in the curve</> : <>{usd(s.reserve)} of {usd(config.riseAt)} USDC funding goal</>}
      </p>

      <dl className="spirit-stats">
        <div><dt>Price</dt><dd>{px(s.price)}</dd></div>
        <div><dt>Market cap</dt><dd>${compact(s.marketCap)}</dd></div>
        <div><dt>Holders</dt><dd>{s.candles}</dd></div>
        <div><dt>Founder pot</dt><dd className="amber">${s.pot?.toFixed(2)}</dd></div>
      </dl>

      <p className={`heartbeat ${s.alive ? 'alive' : 'flat'}`}>
        <svg viewBox="0 0 60 14" aria-hidden><path d={s.alive ? 'M0 7 H18 L22 2 L26 12 L30 4 L33 7 H60' : 'M0 7 H60'} /></svg>
        {s.alive ? (
          <>Active: last commit {ago(s.lastPulseCommitAt || new Date(s.lastPulse * 1000))}. {risen ? 'The founder can withdraw the pot.' : 'The pot unlocks at the funding goal.'}</>
        ) : (
          <>Inactive: no commit since launch. The founder pot stays locked until they push code.</>
        )}
      </p>

      <div className="trade">
        <div className="tabs">
          <button className={tab === 'buy' ? 'on' : ''} onClick={() => setTab('buy')}>Buy</button>
          <button className={tab === 'sell' ? 'on' : ''} onClick={() => setTab('sell')}>Sell</button>
        </div>
        {!tx.address ? (
          <p className="muted small">Connect a wallet (top right) to trade.</p>
        ) : tab === 'buy' ? (
          <>
            <div className="amount">
              <input type="number" min="1" value={amt} onChange={(e) => setAmt(e.target.value)} />
              <span>USDC</span>
            </div>
            <div className="presets">{[10, 50, 250, 1000].map((v) => <button key={v} onClick={() => setAmt(String(v))}>{v}</button>)}</div>
            <p className="muted small">≈ {compact(Number((qb.data ?? 0n) / 10n ** 12n) / 1e6)} ${s.symbol} · 3% fee, 2% of it to the founder pot</p>
            {short_ && <p className="muted small">You have {usd(balance)} gUSDC. <Faucet config={config} onDone={refetch} compact /></p>}
            <button className="btn primary wide" onClick={buy} disabled={!!busy || short_ || usdIn <= 0n}>{label || `Buy · ${usd(amt)} USDC`}</button>
          </>
        ) : (
          <>
            <p className="muted small">You hold {compact(heldN)} ${s.symbol}.</p>
            <div className="presets">{[25, 50, 100].map((v) => <button key={v} className={pct === v ? 'on' : ''} onClick={() => setPct(v)}>{v}%</button>)}</div>
            <p className="muted small">≈ {(Number(qs.data ?? 0n) / 1e6).toFixed(2)} USDC back, after the 3% fee</p>
            <button className="btn ghost wide" onClick={sell} disabled={!!busy || tokensIn <= 0n}>{label || `Sell $${s.symbol}`}</button>
          </>
        )}
        {isFounder && (
          <button className="btn ghost wide claim" onClick={claim} disabled={!!busy || !risen || !s.alive || !(s.pot > 0)} title={!risen ? 'Unlocks at the funding goal' : !s.alive ? 'Push a commit to unlock' : ''}>
            Withdraw founder pot · ${s.pot?.toFixed(2)}
          </button>
        )}
        {err && <p className="err">{err}</p>}
      </div>

      {s.trades?.length > 0 && (
        <ul className="candle-log">
          {s.trades.slice(0, 8).map((t) => (
            <li key={t.tx + t.who}>
              <Flame out={!t.buy} />
              <a href={`${config.explorer}/tx/${t.tx}`} target="_blank" rel="noreferrer">{short(t.who)}</a>
              <span>{t.buy ? 'bought' : 'sold'} ${t.usd.toFixed(t.usd < 10 ? 2 : 0)}</span>
              <small>{ago(t.at)}</small>
            </li>
          ))}
        </ul>
      )}
      <p className="txs">
        <a href={`${config.explorer}/token/${s.token}`} target="_blank" rel="noreferrer">${s.symbol} on BaseScan ↗</a>
        <span>Founder {short(s.founder)}</span>
      </p>
    </div>
  );
}

// ------------------------------------------------------------ séance page

export function SeancePage({ config, plots }) {
  const q = usePoll(() => api('/spirits'), 15_000);
  const spirits = q.data?.spirits || [];
  const unraised = useMemo(() => plots.filter((p) => !p.spirit && p.status !== 'pending').slice(0, 8), [plots]);
  const lit = spirits.reduce((a, p) => a + (p.spirit.candles || 0), 0);
  const pots = spirits.reduce((a, p) => a + (p.spirit.pot || 0), 0);
  return (
    <section className="page seance">
      <div className="seance-head">
        <div className="seance-art" aria-hidden>
          <img className="g" src="/clay/ghost-risen.webp" alt="" />
          <img className="c c1" src="/clay/candle.webp" alt="" />
          <img className="c c2" src="/clay/candle.webp" alt="" />
          <img className="c c3" src="/clay/candle.webp" alt="" />
        </div>
        <p className="eyebrow">Project tokens</p>
        <h1>Launch your project as a token. <em>Earn only while you ship.</em></h1>
        <p className="lede">
          Anyone who listed a project can launch it as a token. Supporters buy in on a bonding curve, and each token has a {usd(config?.riseAt || 1500)} USDC
          funding goal. Founders get no free tokens: they earn from a pot filled by 2% of every trade, and can withdraw it only while they keep committing code.
        </p>
        <div className="seance-stats">
          <span><b>{spirits.length}</b> tokens launched</span>
          <span><b>{lit}</b> holders</span>
          <span><b>${pots.toFixed(2)}</b> in founder pots</span>
        </div>
      </div>

      <ol className="rules">
        <li><b>Fair launch</b>No presale, no team tokens. Price follows a bonding curve, and the USDC in it backs every sell, so nobody can pull the rug.</li>
        <li><b>Funding goal: {usd(config?.riseAt || 1500)} USDC</b>The goal is reached once that much USDC is in the curve. The ghost over the headstone grows as it fills.</li>
        <li><b>Paid for shipping</b>2% of every trade goes into a founder pot. The founder can withdraw it only while the repo has a commit in the last {config?.heartbeatDays || 30} days. We check GitHub and record each new commit on-chain.</li>
        <li><b>Sold projects keep their token</b>If the project is sold, the buyer becomes the founder and can withdraw the pot once they ship.</li>
      </ol>

      <h2>Live tokens</h2>
      {q.data && spirits.length === 0 && <p className="muted">No tokens yet. List a project, then launch one from its page.</p>}
      <div className="spirit-grid">
        {spirits.map((p) => (
          <a key={p.id} className={`spirit-tile ${p.spirit.risenAt ? 'is-risen' : ''}`} href={`#/plot/${p.id}`}>
            <Stone plot={p} size="mini" />
            <div>
              <div className="row"><b>${p.spirit.symbol}</b><span className={`chip ${p.spirit.risenAt ? 'risen' : ''}`}>{p.spirit.risenAt ? 'Goal reached' : `${Math.round((p.spirit.progress || 0) * 100)}% funded`}</span></div>
              <div className="rise-bar"><i style={{ width: `${Math.max(2, (p.spirit.progress || 0) * 100)}%` }} /></div>
              <p className="muted small">{p.name} · {p.spirit.candles} holder{p.spirit.candles === 1 ? '' : 's'} · ${compact(p.spirit.marketCap)} cap</p>
              <p className={`heartbeat mini ${p.spirit.alive ? 'alive' : 'flat'}`}>{p.spirit.alive ? 'Active' : 'Inactive'}</p>
            </div>
          </a>
        ))}
      </div>

      {unraised.length > 0 && (
        <>
          <h2>Projects without a token</h2>
          <p className="muted small">Listed one of these? Open it to launch a token.</p>
          <div className="unraised-row">
            {unraised.map((p) => (
              <a key={p.id} href={`#/plot/${p.id}`} className="unraised-chip">{p.name}</a>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------ little drawings

export function Wisp() {
  return (
    <svg className="wisp-ico" viewBox="0 0 16 16" aria-hidden>
      <path d="M8 1c3 0 5 2.4 5 5.4V14l-1.6-1.2L9.8 14 8 12.6 6.2 14l-1.6-1.2L3 14V6.4C3 3.4 5 1 8 1z" />
      <circle cx="6.2" cy="6.6" r="0.9" />
      <circle cx="9.8" cy="6.6" r="0.9" />
    </svg>
  );
}

function Flame({ out }) {
  return (
    <svg className={`flame ${out ? 'out' : ''}`} viewBox="0 0 10 16" aria-hidden>
      <path d="M5 1C6.5 4 8 5.3 8 8a3 3 0 0 1-6 0c0-1.6.8-2.6 1.6-3.6C4 6 4.6 6.3 5 6c.4-1.6-.4-3.3 0-5z" />
      <rect x="3.5" y="10.5" width="3" height="5" rx="0.6" />
    </svg>
  );
}
