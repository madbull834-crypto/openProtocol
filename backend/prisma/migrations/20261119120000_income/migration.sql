CREATE TABLE "RewardCredit" (
  "id" BIGSERIAL NOT NULL,
  "account" VARCHAR(42) NOT NULL,
  "amount" DECIMAL(78,0) NOT NULL,
  "reason" VARCHAR(66) NOT NULL,
  "blockNumber" BIGINT NOT NULL,
  "txHash" VARCHAR(66) NOT NULL,
  "logIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewardCredit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RewardCredit_txHash_logIndex_key" ON "RewardCredit"("txHash", "logIndex");
CREATE INDEX "RewardCredit_account_reason_idx" ON "RewardCredit"("account", "reason");

CREATE TABLE "Claim" (
  "id" BIGSERIAL NOT NULL,
  "account" VARCHAR(42) NOT NULL,
  "gross" DECIMAL(78,0) NOT NULL,
  "net" DECIMAL(78,0) NOT NULL,
  "royalty" DECIMAL(78,0) NOT NULL,
  "development" DECIMAL(78,0) NOT NULL,
  "blockNumber" BIGINT NOT NULL,
  "txHash" VARCHAR(66) NOT NULL,
  "logIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Claim_txHash_logIndex_key" ON "Claim"("txHash", "logIndex");
CREATE INDEX "Claim_account_idx" ON "Claim"("account");
