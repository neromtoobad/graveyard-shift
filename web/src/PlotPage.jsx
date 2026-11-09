import React, { useEffect, useState } from 'react';
import { useAccount, useSwitchChain, useConfig } from 'wagmi';
import { getWalletClient, waitForTransactionReceipt, readContract } from 'wagmi/actions';
import { encodeFunctionData } from 'viem';
import { api, graveyardAbi, gusdAbi, usd, day, short, until, ago, CHAIN } from './lib.js';
import { Stone, Pulse } from './Tombstone.jsx';
import { useGusd, Faucet } from './Wallet.jsx';
import { usePoll } from './App.jsx';
import { SpiritPanel } from './Spirit.jsx';

export function PlotPage({ id, config, onChange }) {
  const q = usePoll(() => api(`/plots/${id}`), 10_000, [id]);
  const p = q.data?.plot;
  if (q.error) return <section className="page narrow"><p className="err">{q.error}</p><a href="#/">← All projects</a></section>;
  if (!p) return <section className="page"><div className="plot-skel" /></section>;
  const r = p.report || {};
  const f = p.facts || {};
  const refresh = () => {
    q.reload();
    onChange?.();
  };

  return (
    <section className="page plot-page">
      <a className="back" href="#/">← All projects</a>
      <div className="plot-layout">
        <div className="plot-left">
          <div className="plot-stone">
            <Stone plot={p} size="big" />
          </div>
          <div className="links">
            {p.liveUrl && <a className="btn ghost" href={p.liveUrl} target="_blank" rel="noreferrer">Visit the live app ↗</a>}
            <a className="btn ghost" href={`https://github.com/${p.repo}`} target="_blank" rel="noreferrer">Repo on GitHub ↗</a>
          </div>
          <dl className="facts">
            <div><dt>Born</dt><dd>{day(p.vitals.born)}</dd></div>
            <div><dt>Last commit</dt><dd>{day(p.vitals.died)}</dd></div>
            <div><dt>Inactive for</dt><dd>{p.vitals.daysDead} days</dd></div>
            <div><dt>Commits</dt><dd>{f.commitCount}</dd></div>
            <div><dt>Stars · forks</dt><dd>{f.stars} · {f.forks}</dd></div>
            <div><dt>License</dt><dd>{f.license || 'none'}</dd></div>
          </dl>
          {f.languages?.length > 0 && (
            <div className="langs">
              <div className="bar">{f.languages.map((l, i) => <span key={l.name} style={{ flex: l.pct, opacity: 1 - i * 0.16 }} />)}</div>
              <div className="names">{f.languages.map((l) => <span key={l.name}>{l.name} {l.pct}%</span>)}</div>
            </div>
          )}
          <p className="seller">
            Listed by <a href={`${config?.explorer}/address/${p.seller}`} target="_blank" rel="noreferrer">{short(p.seller)}</a>
            {p.proof && <span className="proof" title={p.proof === 'founder' ? 'Listed by the Graveyard Shift founder from their own GitHub' : 'The repo itself names this wallet'}>✓ owner verified</span>}
          </p>
        </div>

        <div className="plot-right">
          <p className="eyebrow">AI review · {r.model === 'rules' ? 'rule-based' : 'by Claude'}</p>
          <h1 className="plot-title">{p.name}</h1>
          {p.tagline && <p className="plot-tag">{p.tagline}</p>}

          <div className="cod">
            <span className="k">Why it stalled</span>
            <p>{r.causeOfDeath}</p>
          </div>
          {p.sellerNote && (
            <blockquote className="note">
              <span className="k">From the seller</span>
              {p.sellerNote}
            </blockquote>
          )}

          <div className="vital">
            <div>
              <span className="k" title="How easy it is to pick back up, 0–100">Revival score</span>
              <span className="big"><Pulse v={r.vitality} /> {r.vitality}<small>/100</small></span>
            </div>
            <div>
              <span className="k">Suggested price</span>
              <span className="big">${usd(r.priceLow)}–{usd(r.priceHigh)}</span>
            </div>
            <div>
              <span className="k">Price</span>
              <span className="big amber">${usd(p.price)}</span>
            </div>
          </div>

          <h4>What the review found</h4>
          <ul className="findings">{(r.diagnosis || []).map((d, i) => <li key={i}>{d}</li>)}</ul>

          <h4>Worth keeping</h4>
          <ul className="salvage">{(r.salvage || []).map((d, i) => <li key={i}>{d}</li>)}</ul>

          <h4>Plan to finish it</h4>
          <ol className="revival">
            {(r.revivalPlan || []).map((s, i) => (
              <li key={i}><span className="when">{s.when}</span>{s.step}</li>
            ))}
          </ol>
          <p className="adopter"><span className="k">Best fit buyer</span>{r.adopter}</p>
        </div>

        <aside className="plot-aside">
          <Deal plot={p} config={config} onChange={refresh} />
          <SpiritPanel plot={p} config={config} onChange={refresh} />
        </aside>
      </div>
    </section>
  );
}

function Deal({ plot: p, config, onChange }) {
  const { address, chainId, connector } = useAccount();
  const wcfg = useConfig();
  const { switchChainAsync } = useSwitchChain();
  const { balance, refetch } = useGusd(config);
  const [gh, setGh] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const me = address?.toLowerCase();
  const isSeller = me && me === p.seller.toLowerCase();
  const isBuyer = me && p.deal && me === p.deal.buyer.toLowerCase();

  const ensureChain = async () => {
    if (chainId !== CHAIN.id) await switchChainAsync({ chainId: CHAIN.id });
    return getWalletClient(wcfg, { chainId: CHAIN.id });
  };

  const run = async (label, fn) => {
    setErr('');
    setBusy(label);
    try {
      await fn();
      onChange();
    } catch (e) {
      setErr((e.shortMessage || e.message || 'Failed').split('\n')[0]);
    } finally {
      setBusy('');
    }
  };

  const adopt = () =>
    run('adopt', async () => {
      const handle = gh.replace(/^@/, '').trim();
      if (!/^[A-Za-z0-9-]{1,39}$/.test(handle)) throw new Error('Enter the GitHub username the repo should go to');
      const wc = await ensureChain();
      const amount = BigInt(Math.round(p.price * 1e6));
      const adoptData = encodeFunctionData({ abi: graveyardAbi, functionName: 'adopt', args: [p.listingKey, p.seller, amount, config.handoverWindow] });
      let hash;
      if (connector?.id === 'baseAccount') {
        // Smart wallet: approve + adopt in one signature, one atomic bundle.
        setBusy('sign');
        const { id } = await wc.sendCalls({
          calls: [
            { to: config.gusd, data: encodeFunctionData({ abi: gusdAbi, functionName: 'approve', args: [config.graveyard, amount] }) },
            { to: config.graveyard, data: adoptData },
          ],
        });
        setBusy('confirming');
        const st = await wc.waitForCallsStatus({ id, timeout: 120_000 });
        if (st.status !== 'success') throw new Error('The bundle did not go through');
        hash = st.receipts.at(-1).transactionHash;
      } else {
        const allowance = await readContract(wcfg, { address: config.gusd, abi: gusdAbi, functionName: 'allowance', args: [address, config.graveyard], chainId: CHAIN.id });
        if (allowance < amount) {
          setBusy('approve');
          const a = await wc.writeContract({ address: config.gusd, abi: gusdAbi, functionName: 'approve', args: [config.graveyard, amount] });
          await waitForTransactionReceipt(wcfg, { hash: a, chainId: CHAIN.id });
        }
        setBusy('sign');
        hash = await wc.sendTransaction({ to: config.graveyard, data: adoptData });
        setBusy('confirming');
        await waitForTransactionReceipt(wcfg, { hash, chainId: CHAIN.id });
      }
      setBusy('recording');
      await api(`/plots/${p.id}/adopt`, { body: { txHash: hash, buyerGithub: handle } });
      refetch();
    });

  const call = (fn, label) =>
    run(label, async () => {
      const wc = await ensureChain();
      const hash = await wc.writeContract({ address: config.graveyard, abi: graveyardAbi, functionName: fn, args: [BigInt(p.deal.id)] });
      await waitForTransactionReceipt(wcfg, { hash, chainId: CHAIN.id });
      await api(`/plots/${p.id}/check`, { body: {} }).catch(() => {});
    });

  const check = () => run('check', () => api(`/plots/${p.id}/check`, { body: {} }));

  if (p.status === 'adopted') {
    const d = p.deal || {};
    return (
      <div className="deal risen-card">
        <span className="k">Sold</span>
        <h3>Sold to @{d.buyerGithub}</h3>
        <p className="muted">{usd(d.amount)} USDC released to the seller{d.releasedBy === 'verifier' ? ' after we confirmed the repo arrived on GitHub' : ''}.</p>
        <TxLinks d={d} config={config} />
      </div>
    );
  }

  if (p.status === 'pending' && p.deal) {
    const d = p.deal;
    const late = Date.now() / 1000 >= d.deadline;
    const moved = d.ownerSeen && d.ownerSeen.toLowerCase() === d.buyerGithub.toLowerCase();
    return (
      <div className="deal pending-card">
        <img className="deal-prop" src="/clay/chest.webp" alt="" />
        <span className="k"><i className="lamp" /> Sale in escrow</span>
        <h3>{usd(d.amount)} USDC locked</h3>
        <ol className="steps">
          <li className="done">@{d.buyerGithub} locked the price on Base <small>{ago(d.openedAt)}</small></li>
          <li className={moved ? 'done' : 'now'}>
            Seller transfers <code>{p.repo}</code> to <b>@{d.buyerGithub}</b>
            <small>
              GitHub → repo Settings → Transfer ownership.{' '}
              {d.lastCheck && <>Last checked {ago(d.lastCheck)}: owner is @{d.ownerSeen || '?'}.</>}
            </small>
          </li>
          <li className={moved ? 'now' : ''}>We confirm it arrived and release the USDC to the seller</li>
        </ol>
        <p className="muted small">The transfer window closes in {until(d.deadline)}. After that the buyer can take a full refund.</p>
        <div className="actions">
          <button className="btn ghost sm" onClick={check} disabled={!!busy}>{busy === 'check' ? 'Checking GitHub…' : 'Check GitHub now'}</button>
          {isBuyer && <button className="btn primary sm" onClick={() => call('confirm', 'confirm')} disabled={!!busy}>{busy === 'confirm' ? 'Releasing…' : 'I have it — release'}</button>}
          {isBuyer && late && <button className="btn ghost sm" onClick={() => call('refund', 'refund')} disabled={!!busy}>Take my money back</button>}
          {isSeller && <button className="btn ghost sm" onClick={() => call('refund', 'refund')} disabled={!!busy}>{busy === 'refund' ? 'Refunding…' : 'Back out and refund'}</button>}
        </div>
        {err && <p className="err">{err}</p>}
        <TxLinks d={d} config={config} />
      </div>
    );
  }

  const short_ = balance != null && balance < p.price;
  return (
    <div className="deal">
      <span className="k">Buy this project</span>
      <div className="ask">
        ${usd(p.price)} <small>USDC</small>
      </div>
      {p.includes?.length > 0 && (
        <ul className="includes">{p.includes.map((s) => <li key={s}>{s}</li>)}</ul>
      )}
      <ol className="steps quiet">
        <li>Your USDC is held in an escrow contract on Base.</li>
        <li>The seller transfers the repo to your GitHub account.</li>
        <li>Once it arrives, the USDC goes to the seller. No transfer within 3 days? You get a full refund.</li>
      </ol>
      {isSeller ? (
        <p className="muted small">This is your listing. Share the link; you'll see the sale here when someone buys it.</p>
      ) : !address ? (
        <p className="muted small">Connect a wallet (top right) to buy. A Base Account works with just a passkey.</p>
      ) : (
        <>
          <label className="field">
            <span>Your GitHub username</span>
            <input value={gh} onChange={(e) => setGh(e.target.value)} placeholder="@you" autoComplete="off" />
          </label>
          {short_ && (
            <p className="muted small">
              You have {usd(balance)} gUSDC. This is a testnet demo, so grab some: <Faucet config={config} onDone={refetch} compact />
            </p>
          )}
          <button className="btn primary wide" onClick={adopt} disabled={!!busy || short_ || !config?.graveyard}>
            {{ adopt: 'Preparing…', approve: 'Approve USDC in your wallet…', sign: 'Confirm in your wallet…', confirming: 'Waiting for Base…', recording: 'Recording the sale…' }[busy] || `Buy for ${usd(p.price)} USDC`}
          </button>
        </>
      )}
      {err && <p className="err">{err}</p>}
      {p.history?.length > 0 && <p className="muted small">{p.history.length} earlier purchase{p.history.length > 1 ? 's' : ''} refunded.</p>}
    </div>
  );
}

function TxLinks({ d, config }) {
  return (
    <p className="txs">
      {d.txHash && <a href={`${config?.explorer}/tx/${d.txHash}`} target="_blank" rel="noreferrer">Escrow tx ↗</a>}
      {d.releaseTx && <a href={`${config?.explorer}/tx/${d.releaseTx}`} target="_blank" rel="noreferrer">Release tx ↗</a>}
      <span>Deal #{d.id}</span>
    </p>
  );
}
