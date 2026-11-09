# Vibeathon 02 · Night Shift: submission fields

Form: https://app.vibestarter.xyz/vibeathon/submit (closes 9 Nov 2026, 22:00 UTC)

**Project name**
Graveyard Shift

**Tagline**
A marketplace for abandoned side projects: sell the repo you stopped working on, or buy one and finish it, with USDC escrow on Base. Or launch it as a token and earn only while you ship.

**Live app URL**
https://graveyard.nerom.site

**What does it do, and what should judges try?**
Every builder has a graveyard of side projects they stopped shipping. Graveyard Shift is a marketplace and a launchpad for them. A builder buries a project and Claude writes an honest autopsy of the repo. Then one of two things can happen.

Adopt: someone who still believes in it locks USDC in an escrow contract on Base. It's released to the seller when the repo is transferred to the buyer's GitHub account. A keeper checks GitHub every 75 seconds and settles on its own.

Séance: the founder raises the project as a token on a bonding curve. It's a fair launch, with no presale and no team tokens, and the USDC in the curve backs every sell. 2% of every trade fills a revival pot that the founder can claim only while the repo has a heartbeat, meaning a commit in the last 30 days, which the keeper reads from GitHub and writes on-chain. If the project is adopted, the founder seat and the pot move to the adopter. Launchpads usually pay founders for launching; this one pays them for shipping.

Try this:
1. Walk the graveyard. Every headstone is drawn from data. Moss grows with the days since the last commit. Stones crack and lean after 90 days. The glow is the coroner's vitality score. The tower has one lit window per buried project, and the watchman's lantern flares while a handover is in escrow.
2. Open a plot to read the coroner's report: cause of death, findings, salvageable assets, a three-step revival plan, who should adopt it, and a fair price band.
3. Bury any public GitHub repo. Claude reads it and writes the autopsy live in about 10 seconds. Listing takes a gasless wallet signature.
4. Open the Séance and light a candle on $KOSO or $GWEEK. Each holder adds a candle at the foot of the headstone, and the ghost above it takes shape as the curve fills toward 1,500 USDC.
5. Adopt one. Connect a Base Account (passkey only, no extension needed), take 1,000 test USDC plus gas from the built-in faucet, and lock the price on Base Sepolia. Approve and adopt go through as one atomic batch. Either side can refund, and the deal settles itself once GitHub shows the transfer.

**Built with**
Claude Code built all of it from one conversation: the Solidity escrow and launchpad with 22 Foundry tests, the Node server (keeper, verifier, faucet), and the React UI, plus the deploys. Claude Opus 5.5 runs inside the product as the coroner, with structured outputs. The rest of the stack is Base Sepolia, Base Account (EIP-5792 batched calls), wagmi/viem, Railway and Vercel.

**Contracts (Base Sepolia, Sourcify-verified)**: escrow 0x74d0C081C24A22e1170dd357a00a9dA25cD335d8 · Séance 0x750d7855Cd4e59bb8909F43eC18AB7FcC13347FA · gUSDC 0x56B5fA16b3f32DcaE2980e17fc967e163409cFca

**Screenshot**: submission/hero.png (1600×1000)
**Repo**: https://github.com/neromtoobad/graveyard-shift (once pushed)
**X handle**: @neromtoobad
**Tools**: Claude Code, Claude
