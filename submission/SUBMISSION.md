# Vibeathon 02 · Night Shift: submission fields

Form: https://app.vibestarter.xyz/vibeathon/submit (closes 9 Nov 2026, 22:00 UTC)

**Project name**
Graveyard Shift

**Tagline**
A marketplace for abandoned side projects: sell the repo you stopped working on, or buy one and finish it, with USDC escrow on Base. Or launch it as a token and earn only while you ship.

**Live app URL**
https://graveyard.nerom.site

**What does it do, and what should judges try?**
Every builder has side projects they stopped working on. Graveyard Shift is a marketplace for them. A seller pastes a public GitHub repo, and Claude writes an honest review for buyers: why it stalled, what's worth keeping, a plan to finish it, and a fair price range. Then one of two things can happen.

Sell it: a buyer locks USDC in an escrow contract on Base and names the GitHub account the repo should go to. The money is released to the seller once the repo arrives in that account. A keeper checks GitHub every 75 seconds and settles on its own. If no transfer happens within 3 days, the buyer gets a full refund.

Launch a token: if the founder wants to keep the project, they can launch it as a token on a bonding curve instead. It's a fair launch, with no presale and no team allocation, and the USDC in the curve backs every sell. 2% of every trade goes into a founder pot. The founder can withdraw it only after the token reaches its 1,500 USDC goal, and only while the repo has a commit in the last 30 days. The keeper reads commits from GitHub and records them on-chain. If the project is sold, the buyer takes over as founder. Most launchpads pay founders for launching; this one pays them for shipping.

Try this:
1. Browse the projects. Each headstone is drawn from real data: it gathers moss and then cracks as the repo goes longer without a commit, a ghost climbs out as its token fills toward the goal, there's one candle per token holder, and a lantern burns while a sale is in escrow.
2. Open a project to read Claude's review: why it stalled, findings, what's worth keeping, a plan to finish it, the best-fit buyer and a suggested price.
3. Sell a project: paste any public GitHub repo. Claude reviews it live in about 10 seconds, and listing takes a gasless wallet signature.
4. Buy a project token, such as $KOSO or $GWEEK, and watch the holder count and funding bar move.
5. Buy a project. Connect a Base Account (passkey only, no extension needed), take 1,000 test USDC plus gas from the built-in faucet, and pay on Base Sepolia. Approve and buy go through as one atomic batch. Either side can refund, and the sale settles itself once GitHub shows the transfer.

**Built with**
Claude Code built all of it from one conversation: the Solidity escrow and token launchpad with 22 Foundry tests, the Node server (keeper, verifier, faucet, trade indexer), the React UI with clay art made in Higgsfield, and the deploys. Claude Opus 5.5 runs inside the product as the reviewer, with structured outputs. The rest of the stack is Base Sepolia, Base Account (EIP-5792 batched calls), wagmi/viem, Railway and Vercel.

**Contracts (Base Sepolia, Sourcify-verified)**: escrow 0x74d0C081C24A22e1170dd357a00a9dA25cD335d8 · token launchpad 0x750d7855Cd4e59bb8909F43eC18AB7FcC13347FA · gUSDC 0x56B5fA16b3f32DcaE2980e17fc967e163409cFca

**Screenshot**: submission/hero.png (1600×1000)
**Repo**: https://github.com/neromtoobad/graveyard-shift
**X handle**: @neromtoobad
**Tools**: Claude Code, Claude
