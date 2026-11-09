import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { api, useHashRoute, usd, ago, short } from './lib.js';
import { Rain, Sky, Tower } from './Scene.jsx';
import { PlotCard, Stone } from './Tombstone.jsx';
import { ConnectButton } from './Wallet.jsx';
import { PlotPage } from './PlotPage.jsx';
import { BuryPage } from './BuryPage.jsx';

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
  else page = <Home plots={plots} stats={statsQ.data} config={config} loading={!plotsQ.data} />;

  return (
    <>
      <header className="top">
        <a className="brand" href="#/">
          <span className="prompt">&gt;_</span> graveyard shift
        </a>
        <nav>
          <a href="#/" className={route === '/' ? 'on' : ''}>The graveyard</a>
          <a href="#/bury" className={route.startsWith('/bury') ? 'on' : ''}>Bury a project</a>
          <a href="#/#how">How it works</a>
        </nav>
        <ConnectButton config={config} />
      </header>
      <main>{page}</main>
      <footer className="foot">
        <div>
          <span className="prompt">&gt;_</span> graveyard shift · built on the night shift for Vibeathon 02
        </div>
        <div className="foot-links">
          {config?.graveyard && (
            <a href={`${config.explorer}/address/${config.graveyard}`} target="_blank" rel="noreferrer">
              Escrow contract {short(config.graveyard)} ↗
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
    let l = plots.filter((p) => filter === 'all' || p.status === filter);
    const by = {
      fresh: (a, b) => a.vitals.daysDead - b.vitals.daysDead,
      vital: (a, b) => (b.report?.vitality || 0) - (a.report?.vitality || 0),
      cheap: (a, b) => a.price - b.price,
      new: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    }[sort];
    return [...l].sort(by);
  }, [plots, filter, sort]);

  const front = useMemo(() => [...plots].sort((a, b) => (b.report?.vitality || 0) - (a.report?.vitality || 0)).slice(0, 5), [plots]);
  const buried = plots.length;
  const adopted = plots.filter((p) => p.status === 'adopted').length;

  return (
    <>
      <section className="hero">
        <Sky />
        <Rain />
        <div className="hill far" />
        <Tower buried={buried} adopted={adopted} />
        <div className="hero-copy">
          <p className="eyebrow">A marketplace for abandoned side projects · on Base</p>
          <h1>
            Every builder has a graveyard.
            <br />
            <em>Now it has a night shift.</em>
          </h1>
          <p className="lede">
            Bury the project you stopped shipping. Someone who still believes in it adopts it, repo and live app and all. Their USDC waits in escrow on
            Base, and goes to you when the repo lands in their GitHub.
          </p>
          <div className="cta">
            <a className="btn primary" href="#plots">Walk the graveyard</a>
            <a className="btn ghost" href="#/bury">Bury a project</a>
          </div>
        </div>
        <div className="hero-stones">
          {front.map((p, i) => (
            <a key={p.id} href={`#/plot/${p.id}`} className={`hs hs${i}`} aria-label={p.name}>
              <Stone plot={p} size="mini" />
            </a>
          ))}
        </div>
        <div className="hill near" />
      </section>

      <section className="ledger">
        <Stat k="Resting" v={stats?.resting ?? '–'} d="projects waiting for an owner" />
        <Stat k="Asking, combined" v={stats ? `$${usd(stats.asking)}` : '–'} d="in USDC" />
        <Stat k="In escrow" v={stats?.escrow ? `$${usd(stats.escrow.locked)}` : '–'} d="read live from the contract" live />
        <Stat k="Adopted" v={stats?.adopted ?? '–'} d="handed over and paid" />
      </section>

      <section className="plots" id="plots">
        <div className="plots-head">
          <h2>The graveyard</h2>
          <div className="filters">
            {['all', 'resting', 'pending', 'adopted'].map((f) => (
              <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                {f === 'pending' ? 'in escrow' : f}
              </button>
            ))}
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
              <option value="fresh">Freshest grave</option>
              <option value="vital">Most revivable</option>
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
          <p className="empty">Nothing here yet. <a href="#/bury">Bury the first one.</a></p>
        )}
      </section>

      <section className="how" id="how">
        <h2>How a handover works</h2>
        <ol>
          <li>
            <span className="n">01</span>
            <h4>Bury it</h4>
            <p>Paste a public repo. The coroner (Claude) reads the code, README and commit history and writes the autopsy: cause of death, what's worth salvaging, a revival plan and a fair price band. You set the asking price and sign it with your wallet.</p>
          </li>
          <li>
            <span className="n">02</span>
            <h4>Someone adopts it</h4>
            <p>The adopter locks the asking price in USDC in the Graveyard contract on Base, and names the GitHub account the repo should go to. The plot's lantern lights. Nobody can touch the money except by the rules below.</p>
          </li>
          <li>
            <span className="n">03</span>
            <h4>Hand over, get paid</h4>
            <p>You transfer the repo on GitHub. Our verifier sees it arrive in the adopter's account and releases the money to you, minus a 2.5% fee. Never transferred? After 3 days the adopter takes it all back. Change your mind? Back out and they're refunded at once.</p>
          </li>
        </ol>
      </section>

      {ev?.events?.length > 0 && (
        <section className="log">
          <h3>Overnight log</h3>
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
    case 'buried': return <>{short(e.seller)} buried {p} for {usd(e.price)} USDC</>;
    case 'adopted': return <>{short(e.buyer)} locked {usd(e.amount)} USDC to adopt {p}</>;
    case 'attested': return <>Repo for {p} arrived at @{e.owner}; escrow released</>;
    case 'released': return <>{p} was handed over and paid out</>;
    case 'refunded': return <>Adoption of {p} was refunded; it rests again</>;
    case 'faucet': return <>{short(e.address)} picked up test USDC</>;
    default: return e.kind;
  }
}

function Stat({ k, v, d, live }) {
  return (
    <div className="stat">
      <span className="k">{k}{live && <i className="livedot" />}</span>
      <span className="v">{v}</span>
      <span className="d">{d}</span>
    </div>
  );
}

function MePage({ plots }) {
  const { address } = useAccount();
  if (!address) return <section className="page narrow"><h2>My plots</h2><p className="muted">Connect a wallet to see the projects you buried and the ones you're adopting.</p></section>;
  const a = address.toLowerCase();
  const mine = plots.filter((p) => p.seller.toLowerCase() === a);
  const adopting = plots.filter((p) => p.deal?.buyer?.toLowerCase() === a);
  return (
    <section className="page">
      <h2>My plots</h2>
      <h4 className="sub">Buried by you</h4>
      {mine.length ? <div className="grid">{mine.map((p) => <PlotCard key={p.id} plot={p} />)}</div> : <p className="muted">None yet. <a href="#/bury">Bury one.</a></p>}
      <h4 className="sub">Adopting</h4>
      {adopting.length ? <div className="grid">{adopting.map((p) => <PlotCard key={p.id} plot={p} />)}</div> : <p className="muted">You haven't adopted anything yet.</p>}
    </section>
  );
}
