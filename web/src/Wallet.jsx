import React, { useState } from 'react';
import { useAccount, useConnect, useDisconnect, useReadContract } from 'wagmi';
import { api, gusdAbi, short, usd, CHAIN } from './lib.js';

export function useGusd(config) {
  const { address } = useAccount();
  const q = useReadContract({
    address: config?.gusd || undefined,
    abi: gusdAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN.id,
    query: { enabled: Boolean(address && config?.gusd), refetchInterval: 15_000 },
  });
  return { balance: q.data != null ? Number(q.data) / 1e6 : null, refetch: q.refetch };
}

export function Faucet({ config, onDone, compact }) {
  const { address } = useAccount();
  const [state, setState] = useState('');
  const [err, setErr] = useState('');
  if (!address || !config?.gusd) return null;
  const go = async () => {
    setErr('');
    setState('busy');
    try {
      await api('/faucet', { body: { address } });
      setState('done');
      onDone?.();
    } catch (e) {
      setErr(e.message);
      setState('');
    }
  };
  return (
    <span className="faucet">
      <button className={`btn ghost ${compact ? 'sm' : ''}`} onClick={go} disabled={state === 'busy'}>
        {state === 'busy' ? 'Pouring…' : state === 'done' ? '1,000 gUSDC sent' : 'Get 1,000 test USDC'}
      </button>
      {err && <span className="err">{err}</span>}
    </span>
  );
}

export function ConnectButton({ config }) {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { balance, refetch } = useGusd(config);
  const [open, setOpen] = useState(false);

  if (isConnected)
    return (
      <div className="wallet">
        <button className="btn pill" onClick={() => setOpen((o) => !o)}>
          <span className="dot" /> {short(address)}
          {balance != null && <span className="bal">{usd(balance)} gUSDC</span>}
        </button>
        {open && (
          <div className="menu" onMouseLeave={() => setOpen(false)}>
            <a href={`#/me`} onClick={() => setOpen(false)}>My listings & purchases</a>
            <Faucet config={config} onDone={refetch} compact />
            <a href={`${config?.explorer}/address/${address}`} target="_blank" rel="noreferrer">View on BaseScan ↗</a>
            <button className="linkish" onClick={() => disconnect()}>Disconnect</button>
          </div>
        )}
      </div>
    );

  return (
    <div className="wallet">
      <button className="btn pill" onClick={() => setOpen((o) => !o)} disabled={isPending}>
        {isPending ? 'Connecting…' : 'Connect'}
      </button>
      {open && (
        <div className="menu">
          {connectors.map((c) => (
            <button
              key={c.uid}
              className="linkish"
              onClick={() => {
                connect({ connector: c, chainId: CHAIN.id });
                setOpen(false);
              }}
            >
              {c.name === 'Injected' ? 'Browser wallet' : c.name}
              {c.id === 'baseAccount' && <small> · passkey, no extension</small>}
            </button>
          ))}
          {error && <span className="err">{error.shortMessage || error.message}</span>}
        </div>
      )}
    </div>
  );
}
