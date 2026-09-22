/**
 * Applies the deterministic rule engine (src/domain/classification.ts) to an owner's UNRESOLVED
 * transactions, then runs transfer matching (src/domain/transfers.ts) to reclassify matched pairs
 * as INTERNAL_TRANSFER. User-set values are never touched (classificationSource === "user").
 */
import { PrismaClient } from "@prisma/client";
import { classify, type ClassifiableTransaction, type ClassificationRule } from "@/domain/classification";
import { matchTransfers } from "@/domain/transfers";
import type { DomainAccount, DomainTransaction } from "@/domain/types";

export async function applyRulesForOwner(db: PrismaClient, ownerId: string): Promise<number> {
  const [rules, transactions] = await Promise.all([
    db.rule.findMany({ where: { ownerId, enabled: true } }),
    db.transaction.findMany({ where: { ownerId, classificationSource: { not: "user" } } }),
  ]);

  const domainRules: ClassificationRule[] = rules.map((r) => ({
    id: r.id,
    priority: r.priority,
    enabled: r.enabled,
    matchDescriptionContains: r.matchDescriptionContains,
    matchMerchant: r.matchMerchant,
    matchAccountId: r.matchAccountId,
    matchMinAmountMinor: r.matchMinAmountMinor,
    matchMaxAmountMinor: r.matchMaxAmountMinor,
    setCategoryId: r.setCategoryId,
    setEconomicClass: r.setEconomicClass,
  }));

  let updated = 0;
  for (const tx of transactions) {
    const classifiable: ClassifiableTransaction = {
      id: tx.id,
      accountId: tx.accountId,
      description: tx.description,
      merchant: tx.merchant,
      amountMinor: tx.amountMinor,
    };
    const outcome = classify(classifiable, domainRules);
    if (outcome.source === "unresolved") continue;
    if (outcome.categoryId === tx.categoryId && outcome.economicClass === tx.economicClass) continue;

    await db.transaction.update({
      where: { id: tx.id },
      data: {
        categoryId: outcome.categoryId,
        economicClass: (outcome.economicClass as never) ?? tx.economicClass,
        classificationSource: outcome.source,
        appliedRuleId: outcome.appliedRuleId,
      },
    });
    updated += 1;
  }
  return updated;
}

export async function matchTransfersForOwner(db: PrismaClient, ownerId: string): Promise<number> {
  const [accounts, transactions] = await Promise.all([
    db.account.findMany({ where: { ownerId } }),
    db.transaction.findMany({
      where: { ownerId, economicClass: { in: ["UNRESOLVED", "EXPENSE", "INCOME"] } },
    }),
  ]);

  const domainAccounts: DomainAccount[] = accounts.map((a) => ({
    id: a.id,
    ownerId: a.ownerId,
    kind: a.kind,
    currency: a.currency,
    includeInNetWorth: a.includeInNetWorth,
    isLiability: a.isLiability,
  }));
  const domainTx: DomainTransaction[] = transactions.map((t) => ({
    id: t.id,
    accountId: t.accountId,
    ownerId: t.ownerId,
    bookedDate: t.bookedDate ? t.bookedDate.toISOString().slice(0, 10) : null,
    transactionDate: t.transactionDate.toISOString().slice(0, 10),
    status: t.status,
    amountMinor: t.amountMinor,
    currency: t.currency,
    description: t.description,
    economicClass: t.economicClass,
  }));

  const candidates = matchTransfers(domainTx, domainAccounts);
  let written = 0;
  for (const c of candidates) {
    const status = c.confidence >= 0.99 ? "CONFIRMED" : "CANDIDATE";
    await db.transferMatch.upsert({
      where: { fromTxId_toTxId: { fromTxId: c.fromTxId, toTxId: c.toTxId } },
      update: { confidence: c.confidence, matchedBy: c.matchedBy, status },
      create: { ownerId, fromTxId: c.fromTxId, toTxId: c.toTxId, confidence: c.confidence, matchedBy: c.matchedBy, status },
    });
    if (status === "CONFIRMED") {
      await db.transaction.updateMany({
        where: { id: { in: [c.fromTxId, c.toTxId] }, classificationSource: { not: "user" } },
        data: { economicClass: "INTERNAL_TRANSFER", classificationSource: "rule" },
      });
    }
    written += 1;
  }
  return written;
}
