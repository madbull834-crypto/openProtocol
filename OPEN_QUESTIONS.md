# Open questions blocking financial implementation

The PDF is not an executable specification. The questions below require written answers before affected functions can safely move funds.

## Critical

1. What are the production and testnet USDT contract addresses, and must non-standard/fee-on-transfer tokens be rejected?
2. Who is the immutable genesis participant, and what happens to rewards when an upline or eligible recipient does not exist?
3. Define “single-leg” ordering and the “active 2+2 Global Matrix” placement algorithm precisely: breadth-first scope, width, depth, spillover parent, tie-break, recycling, and re-entry position.
4. Does the $15 working allocation fund the table on p. 16, the single-leg table on pp. 11–12, direct income, or some combination? Reconcile every $15.
5. Does the $9 non-working allocation fund pp. 13–14? Define when a level completes and how auto-upgrade funds are held and consumed.
6. For every table column, define the triggering event, source balance, eligible recipient, skipped-recipient behavior, rounding, and whether amounts reset each cycle.
7. On p. 10, how many first direct referrals fund upgrades, and when is an “additional” referral eligible for the $12 direct income?
8. On p. 15, what payment base receives 10%/4%/2%/0.5%, and how can 19.5% total upline rewards reconcile with incoming funds?
9. Define the weekly cycle timezone and boundary. Is Sunday the start or end, and how are late/finalized blocks assigned?
10. On p. 25, is superstar income 20%, 10%, 20.10%, or a split? Of which balance? How are ties handled?
11. Who receives the 3% development/maintenance deduction if there is “no owner/admin”? Can that address ever change?
12. How is the 17% royalty fund divided by rank, what is the claim cadence, and what happens when a rank has zero eligible members?

## Contradictions and missing definitions

- Page 20 says both “up to 4×” and “5×”. Confirm the one-star cap and the contribution base.
- Page 19 shows 2× but does not name the rank or qualification.
- Page 24 says five-star requires “4+4+4+4 directs,” identical to four-star, while changing team requirement from 300 to 1,000. Confirm the direct structure.
- Explain whether “team” means personal downline, matrix descendants, global participants, or cycle participants.
- Explain whether the `Member` column on pp. 11–12 is a threshold or the number of payments used to fund that row.
- Page 17 has only a heading. Confirm whether a working-pool continuation table is missing.
- Confirm whether all dollar labels mean exact USDT units at 1 USDT = $1 regardless of depeg.
- Define withdrawal eligibility, minimum/maximum, cadence, claim vs push payment, and whether the 20% deduction applies to all income types.
- Provide all five-star distribution weights and the definition of an “achievement.”
- Clarify “ownership renounced”: immutable deployment, renounced Ownable, governance, or upgradeable proxy with disabled admin. These are materially different security models.

## Product and operations

- Required legal jurisdiction, eligibility restrictions, risk disclosures, privacy terms, and sanctions/KYC policy.
- Final brand assets, approved copy, domain, support channel, and explorer URLs.
- Required RPC provider, indexing confirmation depth, deployment multisig (if any), and incident response plan.

The current testnet contract implements documented assumptions so the complete flow can be validated. Until these questions are answered, the UI must not advertise income as guaranteed and the assumption-based contract must not be used for production or mainnet.
