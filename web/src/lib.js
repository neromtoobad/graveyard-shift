import { http, createConfig } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { baseAccount, injected } from 'wagmi/connectors';
import { parseAbi } from 'viem';

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [baseAccount({ appName: 'Graveyard Shift' }), injected()],
  transports: { [baseSepolia.id]: http(import.meta.env.VITE_RPC_URL || 'https://sepolia.base.org') },
});

export const CHAIN = baseSepolia;

export const graveyardAbi = parseAbi([
  'function adopt(bytes32 listing, address seller, uint96 amount, uint40 window) returns (uint256)',
  'function confirm(uint256 dealId)',
  'function refund(uint256 dealId)',
]);
export const gusdAbi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    method: opts.body ? 'POST' : 'GET',
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
  return j;
}

export const buryMessage = ({ repo, seller, price }) =>
  `Graveyard Shift\nI am burying ${repo} and offering it for adoption.\nSeller: ${seller}\nAsking: ${price} USDC`;

export const short = (a = '') => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
export const usd = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
export const year = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '');
export const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function ago(iso) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function until(unix) {
  const s = unix - Date.now() / 1000;
  if (s <= 0) return 'now';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

/** Deterministic 0..1 from a string, so a stone leans the same way every visit. */
export function seed(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export function useHashRoute(React) {
  const [hash, setHash] = React.useState(location.hash || '#/');
  React.useEffect(() => {
    const on = () => {
      setHash(location.hash || '#/');
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#/, '') || '/';
}
