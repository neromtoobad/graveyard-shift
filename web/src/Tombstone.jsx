import React from 'react';
import { seed, year, usd } from './lib.js';

/**
 * A plot's headstone, in clay. Everything on it is data:
 *  - the stone ages with days since the last commit: fresh, then mossy (a month cold), then cracked and leaning (four months)
 *  - adopted plots wear a flower garland and a sprout: risen
 *  - the halo behind it is the coroner's vitality score (how revivable it is)
 *  - a lantern burns beside it while an adoption is in escrow
 *  - raised as a token: one candle per holder, and a ghost that climbs out as the curve fills
 */
export function stoneKind(plot) {
  const dead = plot.vitals?.daysDead ?? 0;
  if (plot.status === 'adopted') return 'risen';
  if (dead > 120) return 'old';
  if (dead > 30) return 'mossy';
  return 'fresh';
}

export function Stone({ plot, size = 'card' }) {
  const kind = stoneKind(plot);
  const vit = plot.report?.vitality ?? 50;
  const lean = kind === 'old' ? 0 : (seed(plot.id) - 0.5) * 2 * Math.min(2.5, 0.4 + (plot.vitals?.daysDead ?? 0) / 120);
  const pending = plot.status === 'pending';
  const sp = plot.spirit;
  const rise = sp ? Math.min(1, sp.progress || 0) : 0;
  const pose = !sp ? null : sp.risenAt || rise >= 1 ? 'risen' : rise >= 0.34 ? 'float' : 'shy';
  return (
    <div
      className={`stone-wrap ${size} k-${kind} ${pending ? 'pending' : ''} ${sp ? 'has-spirit' : ''} ${pose ? `pose-${pose}` : ''}`}
      style={{ '--vit': vit / 100, '--lean': `${lean}deg`, '--rise': rise }}
    >
      <div className="halo" />
      {pose && <img className="phantom" src={`/clay/ghost-${pose}.webp`} alt="" draggable="false" />}
      <div className="stone">
        <img className="stone-img" src={`/clay/stone-${kind}.webp`} alt="" draggable="false" />
        <div className="engrave">
          {size !== 'mini' && <span className="rip">here lies</span>}
          <h3>{plot.name}</h3>
          <span className="dates">
            {year(plot.vitals?.born)}–{year(plot.vitals?.died)}
          </span>
          {size === 'big' && plot.report?.epitaph && <p className="epitaph">{plot.report.epitaph}</p>}
        </div>
      </div>
      {pending && <img className="lantern" src="/clay/lantern.webp" alt="Adoption in escrow" title="Adoption in escrow" />}
      {sp && <Candles n={sp.candles} id={plot.id} />}
    </div>
  );
}

/** One candle per holder, up to seven, planted along the mound. */
function Candles({ n = 0, id }) {
  const shown = Math.min(7, n);
  if (!shown) return null;
  const slots = [-38, 38, -50, 50, -26, 26, 0];
  return (
    <div className="candles" aria-label={`${n} candle${n === 1 ? '' : 's'} lit`}>
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className="candle" style={{ '--x': `${slots[i]}%`, '--d': `${(seed(id + i) * 2).toFixed(2)}s`, '--s': 0.85 + seed(id + 'h' + i) * 0.3 }}>
          <img src="/clay/candle.webp" alt="" draggable="false" />
          <i />
        </span>
      ))}
    </div>
  );
}

export function PlotCard({ plot }) {
  const status = plot.status === 'adopted' ? 'Sold' : plot.status === 'pending' ? 'In escrow' : 'For sale';
  return (
    <a className={`plot-card s-${plot.status}`} href={`#/plot/${plot.id}`}>
      <Stone plot={plot} />
      <div className="plot-meta">
        <div className="row">
          <span className={`status ${plot.status}`}>{status}</span>
          <span className="price">
            {usd(plot.price)} <small>USDC</small>
          </span>
        </div>
        <p className="tag">{plot.tagline || plot.report?.causeOfDeath}</p>
        {plot.spirit && (
          <div className="row small spirit-row">
            <span className="sym">${plot.spirit.symbol}</span>
            <span className="mini-bar"><i style={{ width: `${Math.max(3, (plot.spirit.progress || 0) * 100)}%` }} /></span>
            <span>{plot.spirit.risenAt ? 'goal reached' : `${Math.round((plot.spirit.progress || 0) * 100)}% funded`}</span>
          </div>
        )}
        <div className="row small">
          <span title="Revival score: how easy the AI review thinks it is to pick back up (0–100)">
            <Pulse v={plot.report?.vitality} /> {plot.report?.vitality ?? '–'}/100 revival
          </span>
          <span>last commit {plot.vitals?.daysDead}d ago</span>
        </div>
      </div>
    </a>
  );
}

export function Pulse({ v = 50 }) {
  // a tiny ECG trace whose spike height is the vitality score
  const h = 2 + (v / 100) * 9;
  return (
    <svg className="pulse" viewBox="0 0 34 14" aria-hidden>
      <path d={`M0 7 H10 L13 ${7 - h * 0.5} L16 ${7 + h * 0.6} L19 ${7 - h} L22 7 H34`} />
    </svg>
  );
}
