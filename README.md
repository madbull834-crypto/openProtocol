# Open Protocol

Testnet-validation implementation derived from the supplied 27-page Community Funding Protocol PDF. The repository implements only rules that reconcile unambiguously. Read [REQUIREMENTS.md](./REQUIREMENTS.md) and [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md) before deployment.

## What is implemented

- UUPS-upgradeable Solidity participation contract for BSC/BEP-20 USDT, with owner-restricted implementation upgrades.
- Exact $25 accounting: $15 Working Matrix, $9 Single-Leg reserve, $1 Weekly Superstar fund.
- Sponsor graph, breadth-first binary matrix, direct/upline rewards, automatic levels and re-entry, ranks, weekly competition, and claims.
- Withdrawal settlement at 80% user / 15% star-club royalty (3% to each of the 1–5 Star clubs) / 5% development.
- Premium React wallet UI with BSC validation, exact approval, registration, on-chain dashboard reads, referral links, and explorer receipts.
- Read-only Fastify/Prisma event indexer with finality lag, idempotent logs, checkpoints, replay, and reorg rewind.
- Contract, frontend utility, and indexer-boundary tests.

Ambiguous features use the explicit testnet assumptions in REQUIREMENTS.md and are not approved production economics.

## Requirements

- Node.js 20+
- npm 10+
- PostgreSQL 15+ (or Docker)

## Local setup

```bash
cp .env.example .env
npm install
npm test
npm run build
```

For the database:

```bash
docker compose up -d postgres
npm run db:migrate -w backend
npm run indexer -w backend
npm run dev -w backend
```

For the web app:

```bash
npm run dev -w frontend
```

Set `VITE_PROTOCOL_ADDRESS` and `VITE_RPC_URL`. `VITE_WALLETCONNECT_PROJECT_ID` is optional: when omitted, the frontend enables EIP-6963 multi-provider discovery plus a generic EIP-1193 injected connector. This supports SafePal, MetaMask, Trust Wallet, Rabby, Binance Wallet, and other compatible EVM wallets when installed or opened through their mobile DApp browser. Set a real Reown project ID only if connections from ordinary mobile Safari/Chrome are required. The frontend reads the USDT token address directly from the deployed protocol contract, avoiding a second address that could drift out of sync. Without a valid protocol address, the UI deliberately shows a setup state instead of mock production metrics.

On BSC testnet, set `VITE_TEST_TOKEN_ADDRESS` to the deployed `MockUSDT` address to show a test-only faucet on the participation page. It mints 1,000 valueless MockUSDT to the connected wallet and is never shown on mainnet or for a different payment token.

## Contract deployment

For testnet-only validation, deploy the included 6-decimal mock USDT first:

```bash
npm run deploy:mock-usdt:testnet -w contracts
```

The command mints 1,000,000 test USDT to the deployer and prints the `USDT_ADDRESS` value for the protocol configuration. Its `mint` function is intentionally public and must never be used as a production token.

1. Resolve the critical questions in `OPEN_QUESTIONS.md` and select independently reviewed recipient vaults and a multisig upgrade owner. The current testnet configuration may reuse the deployer for validation only; production should separate custody roles.
2. Fund the deployer with BSC testnet BNB.
3. Configure `.env`; never commit the key.
4. Run `npm run deploy:testnet -w contracts`.
5. Independently verify the proxy, implementation, initializer arguments, and upgrade owner, then verify source on BscScan.
6. Copy the proxy address into frontend and indexer environment variables, rebuild, and begin indexing from the deployment block.

Future implementations are deployed with `PROTOCOL_PROXY_ADDRESS=<proxy> npm run upgrade:testnet -w contracts`. The command preserves the proxy address and state, validates storage compatibility, and requires the current proxy owner to sign the upgrade.

The deployment script does not deploy placeholder pool vaults. Externally owned accounts should not be used as production pool destinations.

## Current BSC Testnet deployment

| | Address |
|---|---|
| Protocol proxy (use this everywhere) | `0x0f89BF511e1e67fC842ed3967D81E824d3f96E72` |
| Implementation | `0x5B7f3927c968F604D8a797F58A3907aDDC202245` |
| Deployment block (`INDEXER_START_BLOCK`) | `144594547` |
| Test USDT | `0x59ab714Eb2ff96869504302e38d5E8459009e84C` |
| Genesis / owner | `0x9ee6572EcE42BeD72EA265d3AE46D7c60c0489D0` |

Fresh deployment on 2026-11-24 with the 30 USDT ticket (15 Working, 5 Non-Working, 9 Single-Leg, 1 Superstar) self-funding Working / Non-Working matrices, the global first-come-first-served Non-Working queue and qualified-member Single-Leg levels. Set
`PROTOCOL_PROXY_ADDRESS`, `VITE_PROTOCOL_ADDRESS` and `INDEXER_PROTOCOL_ADDRESS` to the proxy and
`INDEXER_START_BLOCK=144594547`. When switching an existing server from a previous proxy
(`0xace1B2C54518f06B86B131ec91d03bB3008D925F`, `0x40c64072Af2e12062Ca5ABC60b62640388982dF6` or `0x1aD54218F561E5Be00D982aC7C0298CE27fBcE47`), clear the indexed tables before restarting the indexer:

```sql
TRUNCATE "Participant", "Allocation", "RewardCredit", "Claim", "PoolQueue", "BlockCheckpoint" RESTART IDENTITY;
```

The implementation was upgraded on 2026-11-24 in block `144642585` to make Working Level 2 use four paid positions: positions 1–2 fund the Level 3 auto-upgrade and positions 3–4 fund distribution. Upgrade transaction: `0x37f24cd3612c847f1a3edf5c7e1d5d723374577d2084c9a9ecc050506476b7ee`.

The implementation was upgraded again on 2026-11-25 in block `144645596` to require 25 global Single-Leg positions after a member, plus two personal directs, for Level 2. Upgrade transaction: `0xe3987a01295f7897abfac85674817b1a973c5312f2e2aaba6aee5f835d83a259`.

## Verification and security

The contract uses an ERC-1967 UUPS proxy. Only the owner can authorize a compatible implementation upgrade; registration funds cannot be moved through an arbitrary admin call. Use a reviewed multisig and timelock as the production owner. Tests are necessary, not sufficient: commission an independent smart-contract and storage-layout audit and obtain legal review before any mainnet or public financial launch.

## Production operations

- Build all packages with `npm run build`.
- Serve `frontend/dist` with the sample `deploy/nginx.conf` and proxy `/api` to Fastify.
- Use Certbot or your managed load balancer for TLS; replace the sample domain first.
- Run the indexer and API as separate supervised services with restricted database credentials.
- Back up PostgreSQL and retain RPC/provider monitoring. The on-chain contract remains authoritative.
- Rollback frontend/backend by redeploying the previous build and database-compatible service version. Immutable contracts cannot be rolled back; a new audited deployment and explicit migration are required.

## Source document caveat

The PDF includes promotional return multipliers and inconsistent tables. This project does not present them as guaranteed returns or convert them into code by assumption.
