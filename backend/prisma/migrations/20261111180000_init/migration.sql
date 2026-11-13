CREATE TABLE "Participant" (
  "address" VARCHAR(42) NOT NULL,
  "sponsor" VARCHAR(42),
  "memberId" BIGINT NOT NULL,
  "directCount" INTEGER NOT NULL DEFAULT 0,
  "joinedAt" TIMESTAMP(3) NOT NULL,
  "blockNumber" BIGINT NOT NULL,
  "txHash" VARCHAR(66) NOT NULL,
  "logIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Participant_pkey" PRIMARY KEY ("address")
);
CREATE UNIQUE INDEX "Participant_memberId_key" ON "Participant"("memberId");
CREATE UNIQUE INDEX "Participant_txHash_logIndex_key" ON "Participant"("txHash", "logIndex");
CREATE INDEX "Participant_sponsor_idx" ON "Participant"("sponsor");

CREATE TABLE "Allocation" (
  "id" BIGSERIAL NOT NULL,
  "account" VARCHAR(42) NOT NULL,
  "workingAmount" DECIMAL(78,0) NOT NULL,
  "nonWorkingAmount" DECIMAL(78,0) NOT NULL,
  "clubAmount" DECIMAL(78,0) NOT NULL,
  "blockNumber" BIGINT NOT NULL,
  "txHash" VARCHAR(66) NOT NULL,
  "logIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Allocation_txHash_logIndex_key" ON "Allocation"("txHash", "logIndex");
CREATE INDEX "Allocation_account_idx" ON "Allocation"("account");

CREATE TABLE "BlockCheckpoint" (
  "blockNumber" BIGINT NOT NULL,
  "blockHash" VARCHAR(66) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlockCheckpoint_pkey" PRIMARY KEY ("blockNumber")
);
