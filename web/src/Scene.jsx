import React, { useEffect, useRef } from 'react';
import { seed } from './lib.js';

/** Diagonal rain on a canvas. Sparse, slow, and off when the viewer prefers less motion. */
export function Rain({ density = 140 }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = cv.getContext('2d');
    let w, h, raf, drops;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const size = () => {
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((density * w) / 1400);
      drops = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, l: 8 + Math.random() * 16, v: 5 + Math.random() * 6, a: 0.06 + Math.random() * 0.16 }));
    };
    size();
    addEventListener('resize', size);
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      for (const d of drops) {
        ctx.strokeStyle = `rgba(190,205,230,${d.a})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.l * 0.22, d.y + d.l);
        ctx.stroke();
        d.y += d.v;
        d.x -= d.v * 0.22;
        if (d.y > h) {
          d.y = -20;
          d.x = Math.random() * (w + 60);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', size);
    };
  }, [density]);
  return <canvas ref={ref} className="rain" aria-hidden />;
}

/**
 * The tower on the hill: the night shift. Fifty windows; one lights for every project ever buried
 * here, and the ones that found a new owner glow green.
 */
export function Tower({ buried = 0, adopted = 0 }) {
  const cols = 5, rows = 10;
  const order = Array.from({ length: cols * rows }, (_, i) => i).sort((a, b) => seed(`w${a}`) - seed(`w${b}`));
  const lit = new Map();
  order.slice(0, Math.min(buried, 50)).forEach((idx, i) => lit.set(idx, i < adopted ? 'adopted' : 'lit'));
  return (
    <svg className="tower" viewBox="0 0 120 300" aria-label={`${buried} projects buried, ${adopted} adopted`}>
      <rect x="10" y="40" width="100" height="260" fill="#0d1117" />
      <rect x="10" y="40" width="100" height="260" fill="url(#tg)" />
      <rect x="40" y="18" width="40" height="22" fill="#0d1117" />
      <text x="60" y="34" textAnchor="middle" className="tower-sign">&gt;_</text>
      {Array.from({ length: cols * rows }, (_, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        const s = lit.get(i);
        return <rect key={i} x={20 + c * 17.5} y={52 + r * 24.5} width="9" height="13" rx="1" className={`win ${s || ''}`} style={{ animationDelay: `${seed(`d${i}`) * 6}s` }} />;
      })}
      <defs>
        <linearGradient id="tg" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.03" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Sky() {
  const stars = Array.from({ length: 70 }, (_, i) => ({ x: seed(`x${i}`) * 100, y: seed(`y${i}`) * 55, r: 0.4 + seed(`r${i}`) * 1.1, d: seed(`t${i}`) * 5 }));
  return (
    <div className="sky" aria-hidden>
      {stars.map((s, i) => (
        <i key={i} className="star" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.r * 2, height: s.r * 2, animationDelay: `${s.d}s` }} />
      ))}
      <div className="moon" />
      <div className="fog f1" />
      <div className="fog f2" />
    </div>
  );
}
