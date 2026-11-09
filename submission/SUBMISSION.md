# Vibeathon 02 · Night Shift: submission fields

Form: https://app.vibestarter.xyz/vibeathon/submit (closes 9 Nov 2026, 22:00 UTC)

**Project name**
Graveyard Shift

**Tagline**
Adopt abandoned side projects. USDC waits in escrow on Base until the repo lands in your GitHub.

**Live app URL**
https://graveyard.nerom.site

**What does it do, and what should judges try?**
Every builder has a graveyard of side projects they stopped shipping. Graveyard Shift is a marketplace for them. A builder buries a project, Claude writes an honest autopsy of the repo, and someone who still believes in it adopts it. Their USDC sits in an escrow contract on Base and is released to the seller when the repo is transferred to the buyer's GitHub account. A keeper checks GitHub every 75 seconds and settles on its own.

Try this:
1. Walk the graveyard. Every headstone is drawn from data. Moss grows with the days since the last commit. Stones crack and lean after 90 days. The glow is the coroner's vitality score. The tower has one lit window per buried project, and the watchman's lantern flares while a handover is in escrow.
2. Open a plot to read the coroner's report: cause of death, findings, salvageable assets, a three-step revival plan, who should adopt it, and a fair price band.
3. Bury any public GitHub repo. Claude reads it and writes the autopsy live in about 10 seconds. Listing takes a gasless wallet signature.
4. Adopt one. Connect a Base Account (passkey only, no extension needed), take 1,000 test USDC plus gas from the built-in faucet, and lock the price on Base Sepolia. Approve and adopt go through as one atomic batch. Either side can refund, and the deal settles itself once GitHub shows the transfer.

**Built with**
Claude Code built all of it from one conversation: Solidity escrow plus 11 Foundry tests, the Node server (keeper, verifier, faucet), and the React UI, plus the deploys. Claude Opus 5.5 runs inside the product as the coroner, with structured outputs. The rest of the stack is Base Sepolia, Base Account (EIP-5792 batched calls), wagmi/viem, Railway and Vercel.

**Contracts (Base Sepolia, Sourcify-verified)**: escrow 0x74d0C081C24A22e1170dd357a00a9dA25cD335d8 · gUSDC 0x56B5fA16b3f32DcaE2980e17fc967e163409cFca

**Screenshot**: submission/hero.png (1600×1000)
**Repo**: https://github.com/neromtoobad/graveyard-shift (once pushed)
**X handle**: @neromtoobad
**Tools**: Claude Code, Claude
