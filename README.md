# Open Protocol

Testnet-validation implementation derived from the supplied 27-page Community Funding Protocol PDF. The repository implements only rules that reconcile unambiguously. Read [REQUIREMENTS.md](./REQUIREMENTS.md) and [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md) before deployment.

## What is implemented

- Immutable Solidity participation contract for BSC/BEP-20 USDT.
- Exact $25 accounting: $15 working pool, $9 non-working pool, $1 five-star club.
- Sponsor graph, breadth-first binary matrix, direct/upline rewards, automatic levels and re-entry, ranks, weekly competition, and claims.
- Withdrawal settlement at 80% user / 17% royalty / 3% development.
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

Set `VITE_PROTOCOL_ADDRESS`, `VITE_USDT_ADDRESS`, `VITE_RPC_URL`, and a real WalletConnect project ID. Without a contract address, the UI deliberately shows a setup state instead of mock production metrics.

## Contract deployment

1. Resolve the critical questions in `OPEN_QUESTIONS.md` and select three independently reviewed immutable recipient vaults.
2. Fund the deployer with BSC testnet BNB.
3. Configure `.env`; never commit the key.
4. Run `npm run deploy:testnet -w contracts`.
5. Independently verify every constructor argument and then verify source on BscScan.
6. Copy the deployment address into frontend and indexer environment variables, rebuild, and begin indexing from the deployment block.

The deployment script does not deploy placeholder pool vaults. Externally owned accounts should not be used as production pool destinations.

## Verification and security

The contract has no owner/admin, proxy, mutable recipient, pause, rescue, or arbitrary-call capability. This minimizes privileged control but makes incorrect deployment arguments permanent. Tests are necessary, not sufficient: commission an independent smart-contract audit and obtain legal review before any mainnet or public financial launch.

## Production operations

- Build all packages with `npm run build`.
- Serve `frontend/dist` with the sample `deploy/nginx.conf` and proxy `/api` to Fastify.
- Use Certbot or your managed load balancer for TLS; replace the sample domain first.
- Run the indexer and API as separate supervised services with restricted database credentials.
- Back up PostgreSQL and retain RPC/provider monitoring. The on-chain contract remains authoritative.
- Rollback frontend/backend by redeploying the previous build and database-compatible service version. Immutable contracts cannot be rolled back; a new audited deployment and explicit migration are required.

## Source document caveat

The PDF includes promotional return multipliers and inconsistent tables. This project does not present them as guaranteed returns or convert them into code by assumption.
