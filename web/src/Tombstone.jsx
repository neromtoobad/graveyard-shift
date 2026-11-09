import React from 'react';
import { seed, year, usd } from './lib.js';

/**
 * A plot's headstone. Everything on it is data:
 *  - moss creeps up with days since the last commit
 *  - a crack appears after 90 days dead, the stone leans further the longer it's been
 *  - the glow behind it is the coroner's vitality score (how revivable it is)
 *  - a lantern burns while an adoption is in escrow; adopted plots stand open, risen
 */
export function Stone({ plot, size = 'card' }) {
  const dead = plot.vitals?.daysDead ?? 0;
  const moss = Math.min(1, dead / 200);
  const lean = (seed(plot.id) - 0.5) * 2 * Math.min(4, 0.6 + dead / 50);
  const vit = plot.report?.vitality ?? 50;
  const risen = plot.status === 'adopted';
  const pending = plot.status === 'pending';
  return (
    <div className={`stone-wrap ${size} ${risen ? 'risen' : ''} ${pending ? 'pending' : ''}`} style={{ '--vit': vit / 100, '--moss': moss, '--lean': `${lean}deg` }}>
      <div className="soul" />
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
