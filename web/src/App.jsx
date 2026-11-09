import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { api, useHashRoute, usd, ago, short } from './lib.js';
import { PlotCard, Stone } from './Tombstone.jsx';
import { ConnectButton } from './Wallet.jsx';
import { PlotPage } from './PlotPage.jsx';
import { BuryPage } from './BuryPage.jsx';
import { SeancePage } from './Spirit.jsx';

export function usePoll(fn, ms, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const run = useCallback(() => fn().then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), deps);
  useEffect(() => {
    run();
    if (!ms) return;
    const t = setInterval(run, ms);
    return () => clearInterval(t);
  }, [run, ms]);
  return { data, error, reload: run };
}

export default function App() {
  const route = useHashRoute(React);
  const { data: config } = usePoll(() => api('/config'), 0);
  const plotsQ = usePoll(() => api('/plots'), 20_000);
  const statsQ = usePoll(() => api('/stats'), 20_000);
  const plots = plotsQ.data?.plots || [];
  const reload = () => {
    plotsQ.reload();
    statsQ.reload();
  };

  let page;
  const m = route.match(/^\/plot\/([a-z0-9-]+)/);
  if (m) page = <PlotPage id={m[1]} config={config} onChange={reload} />;
  else if (route.startsWith('/bury')) page = <BuryPage config={config} onDone={reload} />;
  else if (route.startsWith('/me')) page = <MePage plots={plots} />;
  else if (route.startsWith('/seance')) page = <SeancePage config={config} plots={plots} />;
  else page = <Home plots={plots} stats={statsQ.data} config={config} loading={!plotsQ.data} />;

  return (
    <>
      <header className="top">
        <a className="brand" href="#/">
          <img src="/clay/stone-risen.webp" alt="" /> Graveyard Shift
        </a>
        <nav>
          <a href="#/" className={route === '/' ? 'on' : ''}>Browse projects</a>
          <a href="#/bury" className={route.startsWith('/bury') ? 'on' : ''}>Sell a project</a>
          <a href="#/seance" className={route.startsWith('/seance') ? 'on' : ''}>Launch a token</a>
          <a href="#/#how">How it works</a>
        </nav>
        <ConnectButton config={config} />
      </header>
      <main>{page}</main>
      <footer className="foot">
        <div>
          <img src="/clay/lantern.webp" alt="" /> Graveyard Shift · a marketplace for abandoned side projects · built for Vibeathon 02
        </div>
        <div className="foot-links">
          {config?.graveyard && (
            <a href={`${config.explorer}/address/${config.graveyard}`} target="_blank" rel="noreferrer">
              Escrow contract {short(config.graveyard)} ↗
            </a>
          )}
          {config?.seance && (
            <a href={`${config.explorer}/address/${config.seance}`} target="_blank" rel="noreferrer">
              Token contract {short(config.seance)} ↗
            </a>
          )}
          <span>Base Sepolia · test USDC</span>
        </div>
      </footer>
    </>
  );
}

function Home({ plots, stats, config, loading }) {
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('fresh');
  const { data: ev } = usePoll(() => api('/events'), 30_000);

  useEffect(() => {
    if (location.hash.includes('#how')) document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const list = useMemo(() => {
    let l = plots.filter((p) => filter === 'all' || (filter === 'raised' ? Boolean(p.spirit) : p.status === filter));
    const by = {
      fresh: (a, b) => a.vitals.daysDead - b.vitals.daysDead,
      vital: (a, b) => (b.report?.vitality || 0) - (a.report?.vitality || 0),
      cheap: (a, b) => a.price - b.price,
      new: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    }[sort];
    return [...l].sort(by);
  }, [plots, filter, sort]);

  const front = useMemo(() => [...plots].sort((a, b) => (b.report?.vitality || 0) - (a.report?.vitality || 0)).slice(0, 5), [plots]);
  const pending = plots.filter((p) => p.status === 'pending').length;

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="dot" /> Live on Base · paid in USDC</p>
          <h1>
            The marketplace for abandoned side projects.
          </h1>
          <p className="lede">
            Sell the project you stopped working on, or buy one and finish it. The buyer's payment is held in escrow and released to the seller
            automatically once the GitHub repo is transferred.
          </p>
          <div className="cta">
            <a className="btn primary" href="#plots">Browse projects</a>
            <a className="btn ghost" href="#/bury">Sell a project</a>
          </div>
          <p className="hero-alt">
            Not ready to sell? <a href="#/seance">Launch it as a token</a> and earn from trading fees while you keep building.
          </p>
        </div>
        <div className="hero-scene" aria-label="The five most revivable projects in the graveyard">
          <div className="moon" />
          <div className="hill" />
          <div className="hero-stones">
            {front.map((p, i) => (
              <a key={p.id} href={`#/plot/${p.id}`} className={`hs hs${i}`} aria-label={p.name}>
                <Stone plot={p} size="mini" />
              </a>
            ))}
          </div>
          <figure className={`watchman${pending ? ' on-duty' : ''}`} title={pending ? `${pending} sale${pending > 1 ? 's' : ''} waiting for a repo transfer` : 'No sales in escrow right now'}>
            <span className="lantern-glow" />
            <img src="/clay/watchman.webp" alt="The night watchman, holding a lantern and a spade" width="479" height="760" />
            <figcaption>{pending ? `${pending} sale${pending > 1 ? 's' : ''} in escrow` : 'No sales in escrow'}</figcaption>
          </figure>
        </div>
      </section>

      <section className="how" id="how">
        <h2>How it works</h2>
        <ol>
          <li>
            <img className="step-ico" src="/clay/spade.webp" alt="" /><span className="n">01</span>
            <h4>List your repo</h4>
            <p>Paste a public GitHub repo. An AI review (Claude) reads the code, README and commit history, then writes a report for buyers: why it stalled, what's worth keeping, a plan to finish it and a fair price range. You set the price and sign with your wallet. No gas.</p>
          </li>
          <li>
            <img className="step-ico" src="/clay/chest.webp" alt="" /><span className="n">02</span>
            <h4>A buyer pays into escrow</h4>
            <p>The buyer locks the price in USDC in our escrow contract on Base and names the GitHub account the repo should go to. Neither side can move the money except by the rules in step 3.</p>
          </li>
          <li>
            <img className="step-ico" src="/clay/stone-risen.webp" alt="" /><span className="n">03</span>
            <h4>Transfer the repo, get paid</h4>
            <p>You transfer the repo on GitHub. We check that it arrived in the buyer's account and release the USDC to you, minus a 2.5% fee. No transfer within 3 days? The buyer gets a full refund. The seller can also cancel and refund at any time.</p>
          </li>
          <li>
            <img className="step-ico" src="/clay/ghost-risen.webp" alt="" /><span className="n">04</span>
            <h4>Or launch a token</h4>
            <p>Want to keep it? Launch the project as a token instead, with no presale and no team allocation. 2% of every trade goes into a founder pot that you can withdraw only while you keep committing to the repo. <a href="#/seance">Project tokens →</a></p>
          </li>
        </ol>
      </section>

      <section className="ledger">
        <Stat icon="stone-fresh" k="For sale" v={stats?.resting ?? '–'} d="projects listed right now" />
        <Stat icon="chest" k="Held in escrow" v={stats?.escrow ? `$${usd(stats.escrow.locked)}` : '–'} d="USDC, live from the contract" live />
        <Stat icon="stone-risen" k="Sold" v={stats?.adopted ?? '–'} d="repo transferred, seller paid" />
        <Stat icon="ghost-float" k="Tokens launched" v={stats?.spirits ?? '–'} d={stats ? `${stats.candles} holder${stats.candles === 1 ? '' : 's'}` : 'projects launched as tokens'} />
      </section>

      <section className="plots" id="plots">
        <div className="plots-head">
          <h2>Projects for sale</h2>
          <div className="filters">
            {['all', 'resting', 'pending', 'adopted', 'raised'].map((f) => (
              <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                {{ all: 'All', resting: 'For sale', pending: 'In escrow', adopted: 'Sold', raised: 'Has a token' }[f]}
              </button>
            ))}
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
              <option value="fresh">Most recently active</option>
              <option value="vital">Highest revival score</option>
              <option value="cheap">Cheapest</option>
              <option value="new">Newest listing</option>
            </select>
          </div>
        </div>
        {loading ? (
          <div className="grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="plot-card skeleton" />)}</div>
        ) : list.length ? (
          <div className="grid">{list.map((p) => <PlotCard key={p.id} plot={p} />)}</div>
        ) : (
          <p className="empty">Nothing here yet. <a href="#/bury">List the first one.</a></p>
        )}
      </section>


      {ev?.events?.length > 0 && (
        <section className="log">
          <h3>Recent activity</h3>
          <ul>
            {ev.events.slice(0, 8).map((e, i) => (
              <li key={i}>
                <span className="t">{ago(e.at)}</span> {describe(e)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function describe(e) {
  const p = <a href={`#/plot/${e.plot}`}>{e.plot}</a>;
  switch (e.kind) {
    case 'buried': return <>{short(e.seller)} listed {p} for {usd(e.price)} USDC</>;
    case 'adopted': return <>{short(e.buyer)} paid {usd(e.amount)} USDC into escrow for {p}</>;
    case 'attested': return <>Repo for {p} arrived at @{e.owner}; seller paid</>;
    case 'released': return <>{p} was sold and paid out</>;
    case 'refunded': return <>Purchase of {p} was refunded; it's for sale again</>;
    case 'faucet': return <>{short(e.address)} picked up test USDC</>;
    case 'raised': return <>{p} launched a token, ${e.symbol}</>;
    case 'candle': return <>{short(e.who)} bought ${e.symbol} ({e.usd} USDC)</>;
    case 'snuffed': return <>{short(e.who)} sold ${e.symbol}</>;
    case 'risen': return <>${e.symbol} reached its funding goal</>;
    case 'pulse': return <>New commit on {p} ({e.sha}), recorded on-chain</>;
    case 'claimed': return <>The founder of {p} withdrew {e.usd} USDC from the founder pot</>;
    case 'seat': return <>${e.symbol} founder rewards moved to the new owner, {short(e.founder)}</>;
    default: return e.kind;
  }
}

function Stat({ icon, k, v, d, live }) {
  return (
    <div className="stat">
      {icon && <img className="stat-ico" src={`/clay/${icon}.webp`} alt="" />}
      <span className="k">{k}{live && <i className="livedot" />}</span>
      <span className="v">{v}</span>
      <span className="d">{d}</span>
    </div>
  );
}

function MePage({ plots }) {
  const { address } = useAccount();
  if (!address) return <section className="page narrow"><h2>My projects</h2><p className="muted">Connect a wallet to see the projects you listed and the ones you're buying.</p></section>;
  const a = address.toLowerCase();
  const mine = plots.filter((p) => p.seller.toLowerCase() === a);
  const adopting = plots.filter((p) => p.deal?.buyer?.toLowerCase() === a);
  return (
    <section className="page">
      <h2>My projects</h2>
      <h4 className="sub">Listed by you</h4>
      {mine.length ? <div className="grid">{mine.map((p) => <PlotCard key={p.id} plot={p} />)}</div> : <p className="muted">None yet. <a href="#/bury">List one.</a></p>}
      <h4 className="sub">Bought by you</h4>
      {adopting.length ? <div className="grid">{adopting.map((p) => <PlotCard key={p.id} plot={p} />)}</div> : <p className="muted">You haven't bought anything yet.</p>}
    </section>
  );
}
