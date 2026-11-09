// Base Sepolia wiring: read the Graveyard escrow, and act as its verifier + the gUSDC faucet.
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toBytes,
  parseAbi,
  parseEther,
  decodeEventLog,
  isAddress,
  getAddress,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

export const RPC = process.env.RPC_URL || 'https://sepolia.base.org';
export const GRAVEYARD = process.env.GRAVEYARD_ADDRESS || '';
export const GUSD = process.env.GUSD_ADDRESS || '';
export const EXPLORER = 'https://sepolia.basescan.org';

export const graveyardAbi = parseAbi([
  'function adopt(bytes32 listing, address seller, uint96 amount, uint40 window) returns (uint256)',
  'function confirm(uint256 dealId)',
  'function attest(uint256 dealId)',
  'function refund(uint256 dealId)',
  'function deal(uint256 dealId) view returns ((bytes32 listing, address buyer, address seller, uint96 amount, uint40 openedAt, uint40 deadline, uint8 state))',
  'function dealCount() view returns (uint256)',
  'function openDealOf(bytes32) view returns (uint256)',
  'function feeBps() view returns (uint16)',
  'event Adopted(uint256 indexed dealId, bytes32 indexed listing, address indexed buyer, address seller, uint256 amount, uint40 deadline)',
  'event Released(uint256 indexed dealId, bytes32 indexed listing, address by, uint256 toSeller, uint256 fee)',
  'event Refunded(uint256 indexed dealId, bytes32 indexed listing, address by, uint256 amount)',
]);

export const gusdAbi = parseAbi([
  'function mint(address to, uint256 amount)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

export const STATE = ['none', 'funded', 'released', 'refunded'];

export const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });

const key = process.env.DEPLOYER_KEY;
export const account = key ? privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`) : null;
const wallet = account ? createWalletClient({ account, chain: baseSepolia, transport: http(RPC) }) : null;

export const listingKey = (slug) => keccak256(toBytes(`graveyard-shift:${slug}`));
export const ready = () => Boolean(GRAVEYARD && GUSD);

// One signer, many requests: send its transactions one after another so nonces never collide.
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

export async function readDeal(dealId) {
  const d = await pub.readContract({ address: GRAVEYARD, abi: graveyardAbi, functionName: 'deal', args: [BigInt(dealId)] });
  return {
    listing: d.listing,
    buyer: d.buyer,
    seller: d.seller,
    amount: Number(d.amount) / 1e6,
    openedAt: Number(d.openedAt),
    deadline: Number(d.deadline),
    state: STATE[d.state] || 'none',
  };
}

/** Find the Adopted event in a transaction receipt (works for EOA txs and smart-wallet bundles). */
export async function adoptionFromTx(hash) {
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== GRAVEYARD.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: graveyardAbi, data: log.data, topics: log.topics });
      if (ev.eventName === 'Adopted') {
        return {
          dealId: Number(ev.args.dealId),
          listing: ev.args.listing,
          buyer: ev.args.buyer,
          seller: ev.args.seller,
          amount: Number(ev.args.amount) / 1e6,
          deadline: Number(ev.args.deadline),
          block: Number(receipt.blockNumber),
        };
      }
    } catch {}
  }
  return null;
}

export function attest(dealId) {
  if (!wallet) throw new Error('no verifier key');
  return serial(async () => {
    const hash = await wallet.writeContract({ address: GRAVEYARD, abi: graveyardAbi, functionName: 'attest', args: [BigInt(dealId)] });
    await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
    return hash;
  });
}

/** Testnet faucet: 1,000 gUSDC, plus a sip of gas if the wallet has none. */
export function drip(to) {
  if (!wallet) throw new Error('faucet offline');
  if (!isAddress(to)) throw new Error('bad address');
  to = getAddress(to);
  return serial(async () => {
    const out = {};
    out.mint = await wallet.writeContract({ address: GUSD, abi: gusdAbi, functionName: 'mint', args: [to, 1000n * 1_000_000n] });
    const bal = await pub.getBalance({ address: to });
    if (bal < parseEther('0.0002')) {
      out.gas = await wallet.sendTransaction({ to, value: parseEther(process.env.GAS_DRIP || '0.0004') });
    }
    await pub.waitForTransactionReceipt({ hash: out.mint, timeout: 60_000 });
    if (out.gas) await pub.waitForTransactionReceipt({ hash: out.gas, timeout: 60_000 });
    return out;
  });
}

export async function escrowTotals() {
  if (!ready()) return null;
  const [locked, count, feeBps] = await Promise.all([
    pub.readContract({ address: GUSD, abi: gusdAbi, functionName: 'balanceOf', args: [GRAVEYARD] }),
    pub.readContract({ address: GRAVEYARD, abi: graveyardAbi, functionName: 'dealCount' }),
    pub.readContract({ address: GRAVEYARD, abi: graveyardAbi, functionName: 'feeBps' }),
  ]);
  return { locked: Number(locked) / 1e6, deals: Number(count), feeBps: Number(feeBps) };
}

export async function verifySignature(address, message, signature) {
  try {
    return await pub.verifyMessage({ address, message, signature });
  } catch {
    return false;
  }
}
