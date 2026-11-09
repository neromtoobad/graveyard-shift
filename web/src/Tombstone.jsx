import React from 'react';
import { seed, year, usd } from './lib.js';

/**
 * A plot's headstone. Everything on it is data:
 *  - moss creeps up with days since the last commit
 *  - a crack appears after 90 days dead, the stone leans further the longer it's been
 *  - the glow behind it is the coroner's vitality score (how revivable it is)
 *  - a lantern burns while an adoption is in escrow; adopted plots stand open, risen
 *  - raised as a token: one candle per holder, and a ghost that takes shape as the curve fills
 */
export function Stone({ plot, size = 'card' }) {
  const dead = plot.vitals?.daysDead ?? 0;
  const moss = Math.min(1, dead / 200);
  const lean = (seed(plot.id) - 0.5) * 2 * Math.min(4, 0.6 + dead / 50);
  const vit = plot.report?.vitality ?? 50;
  const risen = plot.status === 'adopted';
  const pending = plot.status === 'pending';
  const sp = plot.spirit;
  const rise = sp ? Math.min(1, sp.progress || 0) : 0;
  return (
    <div
      className={`stone-wrap ${size} ${risen ? 'risen' : ''} ${pending ? 'pending' : ''} ${sp ? 'has-spirit' : ''} ${sp?.risenAt ? 'spirit-risen' : ''}`}
      style={{ '--vit': vit / 100, '--moss': moss, '--lean': `${lean}deg`, '--rise': rise }}
    >
      <div className="soul" />
      {sp && <Ghost id={plot.id} />}
      <div className="stone">
        <svg className="stone-tex" viewBox="0 0 200 260" preserveAspectRatio="none" aria-hidden>
          <defs>
            <filter id={`n-${plot.id}`}>
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={Math.round(seed(plot.id) * 99)} />
              <feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.55  0 0 0 0.22 0" />
            </filter>
          </defs>
          <rect width="200" height="260" filter={`url(#n-${plot.id})`} />
          {dead > 90 && <path d={`M${60 + seed(plot.id + 'c') * 80} 0 l-8 30 l10 18 l-14 34 l6 22`} className="crack" />}
        </svg>
        <div className="moss" />
        <div className="engrave">
          <span className="rip">here lies</span>
          <h3>{plot.name}</h3>
          <span className="dates">
            {year(plot.vitals?.born)} — {year(plot.vitals?.died)}
          </span>
          {size !== 'mini' && <p className="epitaph">{plot.report?.epitaph}</p>}
        </div>
        {risen && <span className="risen-tag">risen</span>}
      </div>
      {pending && (
        <svg className="lantern" viewBox="0 0 24 40" aria-label="Adoption in escrow">
          <path d="M12 2v5" stroke="#6b5a3a" strokeWidth="1.5" />
          <rect x="5" y="7" width="14" height="4" rx="1" fill="#3a3122" />
          <rect x="6" y="11" width="12" height="20" rx="2" fill="#f4b860" fillOpacity="0.85" />
          <rect x="5" y="31" width="14" height="4" rx="1" fill="#3a3122" />
        </svg>
      )}
      <div className="mound" />
      {sp && <Candles n={sp.candles} id={plot.id} />}
    </div>
  );
}

/** The project's ghost: faint at launch, fully formed when the curve fills and it rises. */
function Ghost({ id }) {
  return (
    <svg className="phantom" viewBox="0 0 60 80" aria-hidden>
      <defs>
        <radialGradient id={`g-${id}`} cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor="#f4fff0" stopOpacity="0.95" />
          <stop offset="0.6" stopColor="#c9f7b0" stopOpacity="0.5" />
          <stop offset="1" stopColor="#9fe870" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M30 4c13 0 21 10 21 24v38c-3.5-3-7-3-10.5 0s-7 3-10.5 0-7-3-10.5 0S12.5 69 9 66V28C9 14 17 4 30 4z" fill={`url(#g-${id})`} />
      <ellipse cx="23" cy="28" rx="3" ry="4.2" fill="#0b0f17" fillOpacity="0.7" />
      <ellipse cx="37" cy="28" rx="3" ry="4.2" fill="#0b0f17" fillOpacity="0.7" />
    </svg>
  );
}

/** One candle per holder, up to nine, planted around the mound. */
function Candles({ n = 0, id }) {
  const shown = Math.min(9, n);
  if (!shown) return null;
  const slots = [-44, 44, -56, 56, -32, 32, -66, 66, 0];
  return (
    <div className="candles" aria-label={`${n} candle${n === 1 ? '' : 's'} lit`}>
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className="candle" style={{ '--x': `${slots[i]}%`, '--d': `${(seed(id + i) * 2).toFixed(2)}s`, '--h': 0.8 + seed(id + 'h' + i) * 0.5 }}>
          <i />
        </span>
      ))}
    </div>
  );
}

export function PlotCard({ plot }) {
  const status = plot.status === 'adopted' ? 'Adopted' : plot.status === 'pending' ? 'In escrow' : 'Resting';
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
            <span>{plot.spirit.risenAt ? 'risen' : `${Math.round((plot.spirit.progress || 0) * 100)}%`}</span>
          </div>
        )}
        <div className="row small">
          <span title="Vitality: how revivable the coroner thinks it is">
            <Pulse v={plot.report?.vitality} /> {plot.report?.vitality ?? '–'} vitality
          </span>
          <span>{plot.vitals?.daysDead}d cold</span>
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
