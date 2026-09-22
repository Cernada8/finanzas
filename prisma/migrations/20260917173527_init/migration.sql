-- CreateEnum
CREATE TYPE "ProviderKind" AS ENUM ('DEMO', 'IMPORT', 'CAIXABANK_PSD2', 'IMAGIN_PSD2', 'MYINVESTOR_PSD2', 'TRADE_REPUBLIC_UNSUPPORTED');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('UNCONFIGURED', 'CONNECTING', 'CONSENT_REQUIRED', 'SYNCING', 'CURRENT', 'STALE', 'PARTIALLY_SUPPORTED', 'FAILED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('CASH', 'CARD', 'BROKERAGE_CASH', 'INVESTMENT', 'LOAN', 'OTHER');

-- CreateEnum
CREATE TYPE "EconomicClass" AS ENUM ('INCOME', 'EXPENSE', 'REFUND', 'INTERNAL_TRANSFER', 'INVESTMENT_CASH_FLOW', 'UNRESOLVED');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'BOOKED');

-- CreateEnum
CREATE TYPE "TransferMatchStatus" AS ENUM ('CONFIRMED', 'CANDIDATE', 'REJECTED');

-- CreateEnum
CREATE TYPE "ImportFileType" AS ENUM ('CSV', 'XLSX', 'PDF');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'VALIDATED', 'COMMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('EQUITY', 'ETF', 'FUND', 'BOND', 'CRYPTO', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'FEE', 'TAX', 'TRANSFER_IN', 'TRANSFER_OUT', 'CORPORATE_ACTION');

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es-ES',
    "language" TEXT NOT NULL DEFAULT 'en',
    "reportingCcy" TEXT NOT NULL DEFAULT 'EUR',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerKind" "ProviderKind" NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'ES',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'UNCONFIGURED',
    "capabilities" JSONB NOT NULL,
    "historyDepthDays" INTEGER,
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "tokenCipherVersion" INTEGER,
    "consentExpiresAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastErrorRedacted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "trigger" "SyncTrigger" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "checkpoint" JSONB,
    "recordsRead" INTEGER NOT NULL DEFAULT 0,
    "recordsWritten" INTEGER NOT NULL DEFAULT 0,
    "errorRedacted" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "currency" TEXT NOT NULL,
    "includeInNetWorth" BOOLEAN NOT NULL DEFAULT true,
    "isLiability" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "bookedMinor" BIGINT NOT NULL,
    "pendingMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourceRecordId" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "bookedDate" TIMESTAMP(3),
    "status" "TxStatus" NOT NULL DEFAULT 'BOOKED',
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rawDescription" TEXT NOT NULL,
    "economicClass" "EconomicClass" NOT NULL DEFAULT 'UNRESOLVED',
    "categoryId" TEXT,
    "merchant" TEXT,
    "classificationSource" TEXT NOT NULL DEFAULT 'provider',
    "appliedRuleId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "refundOfId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionSplit" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "note" TEXT,

    CONSTRAINT "TransactionSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferMatch" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "fromTxId" TEXT NOT NULL,
    "toTxId" TEXT NOT NULL,
    "status" "TransferMatchStatus" NOT NULL DEFAULT 'CANDIDATE',
    "confidence" DOUBLE PRECISION NOT NULL,
    "matchedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parentId" TEXT,
    "color" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matchDescriptionContains" TEXT,
    "matchMerchant" TEXT,
    "matchAccountId" TEXT,
    "matchMinAmountMinor" BIGINT,
    "matchMaxAmountMinor" BIGINT,
    "setCategoryId" TEXT,
    "setEconomicClass" "EconomicClass",
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "monthlyLimitMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "startMonth" TEXT NOT NULL,
    "endMonth" TEXT,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" "ImportFileType" NOT NULL,
    "fileHash" TEXT NOT NULL,
    "targetAccountId" TEXT,
    "columnMapping" JSONB NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es-ES',
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "parserName" TEXT NOT NULL DEFAULT 'generic-csv',
    "parserVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "rowsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "rowsErrored" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRecord" (
    "id" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "importBatchId" TEXT,
    "providerName" TEXT,
    "rawPayload" JSONB NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "isin" TEXT,
    "ticker" TEXT,
    "name" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldingSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "units" DECIMAL(28,10) NOT NULL,
    "costBasisMinor" BIGINT,
    "costBasisCcy" TEXT,
    "source" TEXT NOT NULL,
    "isAuthoritativeComplete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HoldingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentActivity" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT,
    "type" "ActivityType" NOT NULL,
    "tradeDate" TIMESTAMP(3) NOT NULL,
    "settlementDate" TIMESTAMP(3),
    "units" DECIMAL(28,10),
    "priceMinor" BIGINT,
    "grossAmountMinor" BIGINT NOT NULL,
    "feeMinor" BIGINT NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "isExternalFlow" BOOLEAN NOT NULL DEFAULT false,
    "dedupeKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "InvestmentActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceObservation" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "priceMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "PriceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxObservation" (
    "id" TEXT NOT NULL,
    "baseCcy" TEXT NOT NULL,
    "quoteCcy" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "FxObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Owner_email_key" ON "Owner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Institution_ownerId_idx" ON "Institution"("ownerId");

-- CreateIndex
CREATE INDEX "Connection_institutionId_idx" ON "Connection"("institutionId");

-- CreateIndex
CREATE INDEX "SyncRun_connectionId_idx" ON "SyncRun"("connectionId");

-- CreateIndex
CREATE INDEX "SyncRun_ownerId_idx" ON "SyncRun"("ownerId");

-- CreateIndex
CREATE INDEX "Account_ownerId_idx" ON "Account"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_institutionId_externalId_key" ON "Account"("institutionId", "externalId");

-- CreateIndex
CREATE INDEX "BalanceSnapshot_accountId_asOf_idx" ON "BalanceSnapshot"("accountId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_sourceRecordId_key" ON "Transaction"("sourceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_dedupeKey_key" ON "Transaction"("dedupeKey");

-- CreateIndex
CREATE INDEX "Transaction_ownerId_bookedDate_idx" ON "Transaction"("ownerId", "bookedDate");

-- CreateIndex
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");

-- CreateIndex
CREATE INDEX "Transaction_economicClass_idx" ON "Transaction"("economicClass");

-- CreateIndex
CREATE INDEX "TransactionSplit_transactionId_idx" ON "TransactionSplit"("transactionId");

-- CreateIndex
CREATE INDEX "TransferMatch_ownerId_idx" ON "TransferMatch"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferMatch_fromTxId_toTxId_key" ON "TransferMatch"("fromTxId", "toTxId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_ownerId_name_key" ON "Category"("ownerId", "name");

-- CreateIndex
CREATE INDEX "Rule_ownerId_idx" ON "Rule"("ownerId");

-- CreateIndex
CREATE INDEX "Budget_ownerId_idx" ON "Budget"("ownerId");

-- CreateIndex
CREATE INDEX "ImportBatch_ownerId_idx" ON "ImportBatch"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_ownerId_fileHash_key" ON "ImportBatch"("ownerId", "fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_isin_ticker_name_key" ON "Instrument"("isin", "ticker", "name");

-- CreateIndex
CREATE INDEX "HoldingSnapshot_accountId_asOf_idx" ON "HoldingSnapshot"("accountId", "asOf");

-- CreateIndex
CREATE INDEX "HoldingSnapshot_instrumentId_idx" ON "HoldingSnapshot"("instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentActivity_dedupeKey_key" ON "InvestmentActivity"("dedupeKey");

-- CreateIndex
CREATE INDEX "InvestmentActivity_accountId_tradeDate_idx" ON "InvestmentActivity"("accountId", "tradeDate");

-- CreateIndex
CREATE UNIQUE INDEX "PriceObservation_instrumentId_asOf_source_key" ON "PriceObservation"("instrumentId", "asOf", "source");

-- CreateIndex
CREATE UNIQUE INDEX "FxObservation_baseCcy_quoteCcy_asOf_source_key" ON "FxObservation"("baseCcy", "quoteCcy", "asOf", "source");

-- CreateIndex
CREATE INDEX "AuditEvent_ownerId_createdAt_idx" ON "AuditEvent"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Institution" ADD CONSTRAINT "Institution_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceSnapshot" ADD CONSTRAINT "BalanceSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "SourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_appliedRuleId_fkey" FOREIGN KEY ("appliedRuleId") REFERENCES "Rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_refundOfId_fkey" FOREIGN KEY ("refundOfId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionSplit" ADD CONSTRAINT "TransactionSplit_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionSplit" ADD CONSTRAINT "TransactionSplit_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferMatch" ADD CONSTRAINT "TransferMatch_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferMatch" ADD CONSTRAINT "TransferMatch_fromTxId_fkey" FOREIGN KEY ("fromTxId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferMatch" ADD CONSTRAINT "TransferMatch_toTxId_fkey" FOREIGN KEY ("toTxId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_setCategoryId_fkey" FOREIGN KEY ("setCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldingSnapshot" ADD CONSTRAINT "HoldingSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldingSnapshot" ADD CONSTRAINT "HoldingSnapshot_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentActivity" ADD CONSTRAINT "InvestmentActivity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentActivity" ADD CONSTRAINT "InvestmentActivity_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
