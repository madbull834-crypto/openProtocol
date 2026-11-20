# Open Protocol requirements

Source: *Community Funding Protocol*, 27 pages, supplied 2026-11-11. Page references below refer to PDF pages, not slide numbers. The source is promotional and contains incomplete operational definitions; statements are classified so unresolved marketing language is not silently converted into financial code.

## Objectives and architecture

- Community funding protocol using transparent blockchain transactions, described as decentralized and ownership-renounced (pp. 1–7, 26).
- A $25 participation ticket feeds a single-leg pool and an active “2+2 Global Matrix” (pp. 6, 8).
- Transactions use USDT (BEP-20), which selects BNB Smart Chain (p. 26).
- The weekly cycle closes every Sunday; the document does not define timezone or exact boundary (p. 26).
- No owner or admin and no centralized control are claimed (pp. 3, 26). Production contracts must therefore use immutable configuration or fully specified autonomous rules.

## Unambiguous financial rules

| Trigger | Allocation | Amount | Source |
|---|---|---:|---|
| Participation | Working pool | $15 USDT | pp. 8, 26 |
| Participation | Non-working pool | $9 USDT | pp. 8, 26 |
| Participation | Lifetime five-star club | $1 USDT | pp. 8, 26 |
| Withdrawal | User wallet | 80% | pp. 18, 26 |
| Withdrawal | Royalty/club fund | 17% | pp. 18, 26 |
| Withdrawal | Development and maintenance | 3% | pp. 18, 26 |

The participation split reconciles to $25. The withdrawal split reconciles to 100%.

## Testnet prototype assumptions

The implementation now includes deterministic rules where the source PDF is incomplete. These are engineering assumptions, not confirmed production business rules:

- Matrix placement is one global breadth-first binary queue. Sponsorship and placement are separate.
- Team size counts sponsor descendants up to ten sponsor levels.
- The first two directs activate a sponsor and their 80% working shares become locked auto-upgrade reserve. From the third direct onward, that 80% (12 USDT) is claimable by the sponsor.
- Remaining working funds use the original ten-level schedule: 10%, 4%, 2%, then 0.5% at levels 4–10. The remaining 0.5% stays reserved. Non-working registration funds remain 80% to the matrix parent, 10% to U1, and 10% shared by U2–U9.
- The single-leg thresholds and exact income/extra/U1/U2 values from levels 1–10 are encoded. Working levels use ID amounts 15, 15, 30, …, 960; non-working levels use 5, 5, 10, …, 40,960.
- Business clarification: Single-Leg Level 3 requires Levels 1 and 2 to have completed sequentially and at least two personal direct referrals, overriding the PDF row that displayed one direct.
- Pool turnover is `team size × ID amount`. The next level's ID amount is consumed for auto-upgrade, and the balance is queued 80% to the achiever, 10% to U1, and 10% across U2–U9.
- An inactive or missing upline is not compressed or replaced. Its unqueued share stays in the matching reserve.
- Exact pool entitlements remain queued until the matching reserve and rank cap can cover the queued amount. Queued entitlements are not included in contract liabilities before settlement.
- Working re-entry occurs every 16 team members and non-working re-entry every 30, funded only when the matching reserve is sufficient.
- Star direct/team thresholds are 4/0, 8/16, 12/64, 16/300, and 16/1,000. Pool earning caps are 2× before star rank, then 5×, 10×, 50×, and uncapped at ranks four and five.
- Five-star members receive one royalty weight at 1,000 team members and another weight for every additional 1,000-member achievement. Club and royalty funds use a weighted accumulator.
- Weeks are Unix/UTC periods, and the earliest highest direct count wins 10% of available working reserve.
- Claims pay 80% to the user, 17% to five-star royalty or the club vault, and 3% to the immutable development address.
- Credits are backed by USDT held by the contract; rewards are never minted.

## Registration and onboarding

- A participant connects a wallet, approves exactly one $25-equivalent ticket in the configured USDT token, and registers with a previously registered sponsor.
- Duplicate registration, zero-address participants, self-sponsorship, and unknown sponsors must revert.
- A single immutable genesis account is registered during deployment so the first external participant has a valid sponsor.
- Sponsor relationships are permanent. This is the minimal safe interpretation needed to represent a referral graph; matrix placement is not inferred from sponsorship.

## Pool tables transcribed from the PDF

### Single-leg pool — hybrid (pp. 11–12)

| Level | Members | Directs | Pool income | Extra | Upline | Upline 2 / super-upline |
|---:|---:|---:|---:|---|---:|---:|
| 1 | 10 | 1 | $10 | $5 global-pool re-entry | $1 | $1 |
| 2 | 15 | 1 | $15 | — | $2 | $2 |
| 3 | 30 | 1 | $35 | $9 one-time re-entry | $3 | $3 |
| 4 | 60 | 2 | $50 | — | $5 | $5 |
| 5 | 250 | 2 | $150 | — | $10 | $10 |
| 6 | 600 | 3 | $500 | — | $30 | $30 |
| 7 | 1,000 | 3 | $1,500 | — | $100 | $100 |
| 8 | 1,500 | 3 | $3,500 | — | $400 | $400 |
| 9 | 2,500 | 4 | $10,000 | — | $1,000 | $1,000 |
| 10 | 3,700 | 4 | $15,000 | — | $2,500 | $2,500 |

The PDF totals pool income at $30,760 and each upline column at $4,051. It does not specify event ordering, qualification snapshots, funding source, skipped-upline behavior, or whether “member” is global, downline, or cycle-local.

### Non-working pool (pp. 13–14)

Levels 1–15 use team sizes 2, 4, …, 30 and ID amounts $5, $5, $10, $20, $40, …, $40,960. Turnover is shown as team × ID amount. Each row allocates an auto-upgrade amount, then 80% income, 10% U1 income, and 10% U2–U9 income. The table totals are: ID amount $81,920; turnover $2,293,770; income $1,769,484; each 10% column $221,185.50. These totals do not reconcile exactly with row labels without additional definitions and are not executable specifications.

### Working pool (p. 16)

Levels 1–8 show team sizes 2–16, ID amounts $15, $15, $30, $60, $120, $240, $480, $960, and turnover $30 through $15,360. After auto-upgrade, each row is presented as 80% income, 10% U1, and 10% U2–U9. The PDF omits later levels and distribution mechanics.

### Other income and ranks

- Ten-level upline income: L1 10%, L2 4%, L3 2%, L4–L10 0.5% each (p. 15). The base amount and qualification rules are unspecified.
- Direct income: first referrals “help you upgrade”; additional eligible referrals earn $12 (p. 10). The first-referral count and “eligible” definition are unspecified.
- Royalty: 17% of withdrawals funds rank-based royalty (p. 18).
- Club claims: unlabelled rank up to 2× (p. 19); one-star is associated with four directs and contradictory 4×/5× labels (p. 20); two-star, 16 team, 4+4 directs, up to 10× (p. 21); three-star, 64 team, 4+4+4 directs, up to 50× (p. 22); four-star, 300 team, 4+4+4+4 directs, lifetime income (p. 23); five-star, 1,000 team, displayed 4+4+4+4 directs, and $1 per achievement distributed among achievers (p. 24).
- Weekly superstar: highest direct-referral achiever receives a one-time amount, but “20%.10%” is contradictory (p. 25).

## Smart-contract specification implemented now

`OpenProtocolParticipation`:

- immutable BEP-20 token, pool/vault destinations, development destination, ticket size, and genesis participant;
- atomic `transferFrom` collection and internal 60% / 36% / 4% ($15/$9/$1) pool accounting;
- permanent sponsor graph, binary placement, levels, ranks, re-entry, rewards, claims, accounting totals, and events;
- duplicate/invalid sponsor protection and reentrancy protection;
- no owner, admin, pausing, upgrades, rescue path, hidden recipient changes, or arbitrary transfer authority.

The contract now implements those features under the testnet assumptions above. The assumption-based modules require an independent specification and audit before production use.

## Frontend specification

- Premium dark fintech landing page explaining only documented features.
- Wallet connection, BSC network validation, token approval, registration transaction, receipt state, and explorer links.
- Dashboard reads registration, sponsor, placement, levels, rank, team size, claimable rewards, and protocol totals.
- Referral view generates a wallet-specific link and reads direct events through the indexer.
- Admin route is omitted because the PDF explicitly says no owner/admin.

## Backend specification

- Read-only event indexer for `ParticipantRegistered` and `ParticipationAllocated`.
- PostgreSQL/Prisma persistence with block checkpoints, unique `(transactionHash, logIndex)` identity, idempotent upserts, confirmation lag, and rewind support for reorg recovery.
- Backend never signs transactions or authorizes transfers.

## Nonfunctional requirements

- Solidity `^0.8.24`, TypeScript strict mode, integer-safe accounting, checks-effects-interactions, SafeERC20, reentrancy protection, bounded work per transaction.
- Responsive and accessible UI; no fabricated production metrics.
- Secrets supplied via environment variables; testnet-first deployment and independent security review before mainnet.

## User journeys

1. Visitor reviews mechanics and risk disclosures, connects a wallet, and switches to BSC.
2. New participant follows a sponsor link, approves the exact ticket, and registers.
3. Contract records the sponsor graph and atomically allocates the ticket to immutable pool vaults.
4. Participant views on-chain status and indexed history.
5. Future pool claims and withdrawals remain disabled until the rules in `OPEN_QUESTIONS.md` are resolved and independently reviewed.

## Calculation examples

- One ticket: 25 USDT debited; 15 working + 9 non-working + 1 club = 25 USDT.
- 100 tickets: 2,500 USDT received/transferred; 1,500 working + 900 non-working + 100 club = 2,500 USDT.
- Hypothetical withdrawal split only: 100 USDT gross → 80 user + 17 royalty + 3 development. This is documented but not implemented because eligibility and recipients are undefined.
