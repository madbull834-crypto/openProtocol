# Architecture

```text
Wallet (BSC) ── approve/register ──> OpenProtocolParticipation
                                      ├── 15 USDT → working ledger/reserve
                                      ├──  9 USDT → matrix ledger/reserve
                                      └──  1 USDT → five-star accumulator
                                             │
Participant ── claim ────────────────────────┼── 80% → participant
                                             ├── 15% → star clubs, 3% each for 1–5 Star (empty club → vault)
                                             └──  5% → development fund
                                                │
Contract events ── read-only indexer ──> PostgreSQL ──> analytics API ──> Web app
```

The contract is the authority for registration and token movement. The backend is a disposable projection. Pool vault implementations are intentionally not supplied until their payout state machines are clarified.

## Trust model

- No proxy and no upgrade authority.
- No owner/admin role.
- Token and recipient vaults are constructor immutables.
- A deployment is correct only if the constructor arguments are independently verified before use.
- A mistaken recipient cannot be repaired; a new deployment and user migration would be required. This is the cost of the PDF's no-admin requirement.

## Production modularization after clarification

The testnet prototype keeps the reward engine together for end-to-end validation. A production design should split independently audited immutable modules such as `WorkingPool`, `NonWorkingPool`, `MatrixPlacement`, `RoyaltyPool`, and `WithdrawalRouter`, each with a complete conservation invariant and bounded execution.
