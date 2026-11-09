# Vibeathon 02 · Night Shift: submission fields

Form: https://app.vibestarter.xyz/vibeathon/submit (closes 9 Nov 2026, 22:00 UTC)

**SUBMITTED 9 Nov 2026, 15:34 local. Text below is exactly what was sent (limits: tagline 140, description 2000, built with 200).**

**Project name**
Graveyard Shift

**Tagline**
Marketplace for abandoned side projects: sell your repo or buy one to finish, paid via USDC escrow on Base. Or launch it as a token.

**Live app URL**
https://graveyard.nerom.site

**Demo video**
https://youtu.be/tO_EvPLJjPE

**What does it do, and what should judges try?**
A marketplace for side projects builders stopped working on. A seller pastes a public GitHub repo and Claude writes an honest review for buyers: why it stalled, what's worth keeping, a plan to finish it, and a fair price.

Sell it: a buyer locks USDC in an escrow contract on Base and names the GitHub account the repo should go to. A keeper checks GitHub every 75 seconds and releases the money to the seller once the repo arrives. No transfer within 3 days? The buyer gets a full refund.

Or launch a token: the founder launches the project on a bonding curve, with no presale and no team allocation. 2% of every trade goes into a founder pot they can withdraw only after the 1,500 USDC goal, and only while the repo has a commit in the last 30 days (the keeper records commits on-chain). If the project is sold, the buyer becomes the founder. It pays founders for shipping, not launching.

Try this:
1. Browse projects. Each headstone is drawn from data: moss and cracks grow with days since the last commit, a ghost rises as the token fills, one candle per holder.
2. Open a project and read Claude's review.
3. Sell a project: paste any public repo. The review runs live in ~10s; listing is a gasless signature.
4. Buy a project token like $KOSO or $GWEEK.
5. Buy a project: connect a Base Account (passkey only), grab 1,000 test USDC from the built-in faucet, and pay on Base Sepolia in one batched approve+buy.

Contracts (Base Sepolia, verified): escrow 0x74d0C081C24A22e1170dd357a00a9dA25cD335d8 · launchpad 0x750d7855Cd4e59bb8909F43eC18AB7FcC13347FA

**Built with**
Claude Code built it all: contracts + 22 Foundry tests, Node keeper and verifier, React UI, deploys. Claude Opus 5.5 is the in-app reviewer. Base Sepolia, Base Account, wagmi, Higgsfield art.


**Screenshot**: submission/hero.png (1600×1000)
**Repo**: https://github.com/neromtoobad/graveyard-shift
**X handle**: @neromtoobad
**Tools**: Claude Code, Claude
