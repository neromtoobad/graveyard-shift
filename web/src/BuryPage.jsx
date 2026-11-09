import React, { useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { api, buryMessage, usd, short } from './lib.js';
import { Stone } from './Tombstone.jsx';

const LINES = [
  'Pulling the repo from GitHub…',
  'Counting commits and reading the README…',
  'Checking whether the live app still answers…',
  'Looking for what is worth salvaging…',
  'Writing the epitaph…',
];
const INCLUDES = ['Repo', 'Live app', 'Domain', 'Contracts', 'Users / waitlist', 'Socials', 'Design files', 'Brand'];

export function BuryPage({ config, onDone }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [repo, setRepo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [line, setLine] = useState(0);
  const [err, setErr] = useState('');
  const [a, setA] = useState(null); // autopsy result
  const [form, setForm] = useState({ name: '', tagline: '', liveUrl: '', price: '', includes: ['Repo'] });
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (busy !== 'autopsy') return;
    const t = setInterval(() => setLine((l) => (l + 1) % LINES.length), 1900);
    return () => clearInterval(t);
  }, [busy]);

  const examine = async (e) => {
    e?.preventDefault();
    setErr('');
    setA(null);
    setBusy('autopsy');
    setLine(0);
    try {
      const out = await api('/autopsy', { body: { repo, note } });
      setA(out);
      const mid = Math.round(((out.report.priceLow + out.report.priceHigh) / 2) / 10) * 10;
      setForm({
        name: out.facts.name,
        tagline: out.facts.description || '',
        liveUrl: out.facts.homepage || '',
        price: String(mid || 100),
        includes: out.facts.homepage ? ['Repo', 'Live app'] : ['Repo'],
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const bury = async () => {
    setErr('');
    try {
      if (!address) throw new Error('Connect a wallet first (top right). It becomes the wallet that gets paid.');
      const price = Math.round(Number(form.price));
      if (!(price >= 1)) throw new Error('Set an asking price');
      setBusy('sign');
      const message = buryMessage({ repo: a.facts.repo, seller: address, price });
      const signature = await signMessageAsync({ message });
      setBusy('list');
      const { plot } = await api('/plots', { body: { ...form, price, repo: a.facts.repo, note, seller: address, signature } });
      setDone(plot);
      onDone?.();
    } catch (e) {
      setErr((e.shortMessage || e.message).split('\n')[0]);
    } finally {
      setBusy('');
    }
  };

  if (done)
    return (
      <section className="page narrow bury-done">
        <Stone plot={done} size="big" />
        <h2>{done.name} is laid to rest.</h2>
        <p className="muted">It's in the graveyard now, waiting for someone to adopt it for {usd(done.price)} USDC.</p>
        <div className="proof-box">
          <h4>Get the ✓ owner verified badge</h4>
          <p>Add a file named <code>.graveyard</code> to the root of <code>{done.repo}</code> containing your wallet address:</p>
          <pre>{done.seller}</pre>
          <ProofCheck id={done.id} />
        </div>
        <div className="cta center">
          <a className="btn primary" href={`#/plot/${done.id}`}>See the plot</a>
          <a className="btn ghost" href={`#/plot/${done.id}`}>Raise it as a token</a>
        </div>
      </section>
    );

  const preview = a && {
    id: 'preview',
    name: form.name || a.facts.name,
    vitals: a.vitals,
    report: a.report,
    status: 'resting',
  };

  return (
    <section className="page bury">
      <div className="bury-head">
        <img className="head-prop" src="/clay/spade.webp" alt="" />
        <p className="eyebrow">Bury a project</p>
        <h1>Some projects don't need to die. <em>They need a new owner.</em></h1>
        <p className="lede">Paste the public GitHub repo of something you stopped working on. The coroner reads it and writes an honest autopsy that adopters will see.</p>
      </div>

      <form className="exam" onSubmit={examine}>
        <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="github.com/you/that-project" aria-label="GitHub repo" />
        <button className="btn primary" disabled={!repo || busy === 'autopsy'}>{busy === 'autopsy' ? 'Examining…' : a ? 'Re-examine' : 'Perform autopsy'}</button>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional: in your own words, why did you stop? (The coroner takes it into account.)" rows={2} maxLength={400} />
      </form>
      {err && <p className="err">{err}</p>}

      {busy === 'autopsy' && (
        <div className="examining">
          <div className="scan" />
          <p>{LINES[line]}</p>
        </div>
      )}

      {a && (
        <div className="bury-grid">
          <div className="bury-preview">
            <Stone plot={preview} size="big" />
            <p className="cod-small"><span className="k">Cause of death</span>{a.report.causeOfDeath}</p>
            <ul className="findings">{a.report.diagnosis.map((d, i) => <li key={i}>{d}</li>)}</ul>
            <p className="muted small">Vitality {a.report.vitality}/100 · {a.facts.commitCount} commits · {a.vitals.daysDead} days since the last one</p>
          </div>
          <div className="bury-form">
            {a.existing && <p className="err">This repo is already in the graveyard: <a href={`#/plot/${a.existing}`}>see it</a>.</p>}
            <label className="field"><span>Name on the stone</span><input value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="field"><span>One line: what it is</span><input value={form.tagline} maxLength={140} onChange={(e) => setForm({ ...form, tagline: e.target.value })} /></label>
            <label className="field"><span>Live URL</span><input value={form.liveUrl} onChange={(e) => setForm({ ...form, liveUrl: e.target.value })} placeholder="https://" /></label>
            <div className="field">
              <span>What the adopter gets</span>
              <div className="chips">
                {INCLUDES.map((s) => (
                  <button type="button" key={s} className={form.includes.includes(s) ? 'on' : ''} onClick={() => setForm({ ...form, includes: form.includes.includes(s) ? form.includes.filter((x) => x !== s) : [...form.includes, s] })}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>Asking price (USDC) · coroner suggests ${usd(a.report.priceLow)}–{usd(a.report.priceHigh)}</span>
              <input type="number" min="1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </label>
            <p className="muted small">
              {address ? <>Payment goes to {short(address)}. You'll sign a message to prove it's yours; no gas.</> : 'Connect a wallet (top right): it becomes the wallet that gets paid.'}
            </p>
            <button className="btn primary wide" onClick={bury} disabled={!!busy || !!a.existing}>
              {busy === 'sign' ? 'Sign in your wallet…' : busy === 'list' ? 'Digging…' : 'Bury it'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ProofCheck({ id }) {
  const [s, setS] = useState('');
  const go = async () => {
    setS('checking');
    try {
      const { proof } = await api(`/plots/${id}/proof`, { body: {} });
      setS(proof ? 'yes' : 'no');
    } catch {
      setS('no');
    }
  };
  return (
    <p>
      <button className="btn ghost sm" onClick={go} disabled={s === 'checking'}>{s === 'checking' ? 'Checking…' : 'I added it, check'}</button>{' '}
      {s === 'yes' && <span className="ok">Verified ✓</span>}
      {s === 'no' && <span className="muted small">Not found yet. GitHub can take a minute.</span>}
    </p>
  );
}
