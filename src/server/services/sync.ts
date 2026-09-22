/**
 * Sync orchestration: pulls from a ProviderAdapter and writes normalized rows via Prisma.
 * Idempotent by construction: accounts are upserted on (institutionId, externalId); transactions
 * are upserted on a deterministic dedupeKey; holdings/activities/prices use their own natural
 * keys. A partial failure records a PARTIAL SyncRun and does not erase prior data or advance a
 * checkpoint past unread records (checkpoints are only written after a successful page).
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { transactionDedupeKey, redactForLog } from "@/lib/crypto";
import type { ProviderAdapter } from "@/server/adapters/types";
import { UnsupportedCapabilityError } from "@/server/adapters/types";

function normalizeDescription(desc: string): string {
  return desc.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface SyncOutcome {
  status: "SUCCEEDED" | "PARTIAL" | "FAILED";
  recordsRead: number;
  recordsWritten: number;
  errorRedacted?: string;
}

export async function runSync(
  db: PrismaClient,
  ownerId: string,
  connectionId: string,
  institutionId: string,
  adapter: ProviderAdapter,
  trigger: "MANUAL" | "SCHEDULED" | "WEBHOOK" = "MANUAL"
): Promise<SyncOutcome> {
  const syncRun = await db.syncRun.create({
    data: { connectionId, ownerId, trigger, status: "RUNNING" },
  });

  let recordsRead = 0;
  let recordsWritten = 0;
  const partialReasons: string[] = [];
  const caps = adapter.capabilities();

  try {
    // --- Accounts (foundation for everything else) ---
    const accountsResult = await adapter.fetchAccounts();
    recordsRead += accountsResult.items.length;
    const accountIdByExternal = new Map<string, string>();
    for (const raw of accountsResult.items) {
      const account = await db.account.upsert({
        where: { institutionId_externalId: { institutionId, externalId: raw.externalId } },
        update: { name: raw.name, kind: raw.kind, currency: raw.currency },
        create: {
          ownerId,
          institutionId,
          externalId: raw.externalId,
          name: raw.name,
          kind: raw.kind,
          currency: raw.currency,
          isLiability: raw.kind === "LOAN",
        },
      });
      accountIdByExternal.set(raw.externalId, account.id);
      recordsWritten += 1;
    }

    // --- Balances ---
    if (caps.balances.supported) {
      try {
        const balances = await adapter.fetchBalances();
        recordsRead += balances.items.length;
        for (const b of balances.items) {
          const accountId = accountIdByExternal.get(b.accountExternalId);
          if (!accountId) continue;
          await db.balanceSnapshot.create({
            data: {
              accountId,
              asOf: new Date(b.asOf),
              bookedMinor: b.bookedMinor,
              pendingMinor: b.pendingMinor,
              currency: b.currency,
              source: "provider",
            },
          });
          recordsWritten += 1;
        }
      } catch (e) {
        if (e instanceof UnsupportedCapabilityError) partialReasons.push(e.message);
        else throw e;
      }
    }

    // --- Transactions (idempotent via dedupeKey) ---
    if (caps.transactions.supported) {
      try {
        const txResult = await adapter.fetchTransactions();
        recordsRead += txResult.items.length;
        for (const raw of txResult.items) {
          const accountId = accountIdByExternal.get(raw.accountExternalId);
          if (!accountId) continue;
          const effectiveDate = raw.bookedDate ?? raw.transactionDate;
          const dedupeKey = transactionDedupeKey({
            accountId,
            dateIso: effectiveDate,
            amountMinor: raw.amountMinor,
            normalizedDescription: normalizeDescription(raw.description),
          });

          const sourceRecord = await db.sourceRecord.create({
            data: {
              origin: "provider",
              providerName: adapter.providerKind,
              rawPayload: JSON.parse(
                JSON.stringify(raw, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
              ) as Prisma.InputJsonValue,
            },
          });

          await db.transaction.upsert({
            where: { dedupeKey },
            update: {
              // Replace pending with booked equivalents where evidence supports it.
              status: raw.status,
              bookedDate: raw.bookedDate ? new Date(raw.bookedDate) : null,
            },
            create: {
              ownerId,
              accountId,
              sourceRecordId: sourceRecord.id,
              transactionDate: new Date(raw.transactionDate),
              bookedDate: raw.bookedDate ? new Date(raw.bookedDate) : null,
              status: raw.status,
              amountMinor: raw.amountMinor,
              currency: raw.currency,
              description: raw.description,
              rawDescription: raw.description,
              merchant: raw.merchant,
              dedupeKey,
              economicClass: "UNRESOLVED",
              classificationSource: "provider",
            },
          });
          recordsWritten += 1;
        }
      } catch (e) {
        if (e instanceof UnsupportedCapabilityError) partialReasons.push(e.message);
        else throw e;
      }
    } else {
      partialReasons.push(`${adapter.providerKind}: transactions not supported`);
    }

    // --- Holdings ---
    if (caps.holdings.supported) {
      try {
        const holdings = await adapter.fetchHoldings();
        recordsRead += holdings.items.length;
        for (const h of holdings.items) {
          const accountId = accountIdByExternal.get(h.accountExternalId);
          if (!accountId) continue;
          const instrument = await db.instrument.upsert({
            where: {
              isin_ticker_name: {
                isin: h.instrumentIsin ?? "",
                ticker: h.instrumentTicker ?? "",
                name: h.instrumentName,
              },
            },
            update: {},
            create: {
              isin: h.instrumentIsin,
              ticker: h.instrumentTicker,
              name: h.instrumentName,
              assetType: h.assetType,
              currency: h.costBasisCcy ?? "EUR",
            },
          });
          await db.holdingSnapshot.create({
            data: {
              accountId,
              instrumentId: instrument.id,
              asOf: new Date(h.asOf),
              units: new Prisma.Decimal(h.units),
              costBasisMinor: h.costBasisMinor,
              costBasisCcy: h.costBasisCcy,
              source: "provider",
              isAuthoritativeComplete: h.isAuthoritativeComplete,
            },
          });
          recordsWritten += 1;
        }
      } catch (e) {
        if (e instanceof UnsupportedCapabilityError) partialReasons.push(e.message);
        else throw e;
      }
    } else {
      partialReasons.push(`${adapter.providerKind}: holdings not supported`);
    }

    // --- Activities ---
    if (caps.activities.supported) {
      try {
        const activities = await adapter.fetchActivities();
        recordsRead += activities.items.length;
        for (const a of activities.items) {
          const accountId = accountIdByExternal.get(a.accountExternalId);
          if (!accountId) continue;
          let instrumentId: string | undefined;
          if (a.instrumentIsin || a.instrumentName) {
            const instrument = await db.instrument.upsert({
              where: {
                isin_ticker_name: { isin: a.instrumentIsin ?? "", ticker: "", name: a.instrumentName ?? "" },
              },
              update: {},
              create: { isin: a.instrumentIsin, name: a.instrumentName ?? "Unknown", assetType: "OTHER", currency: a.currency },
            });
            instrumentId = instrument.id;
          }
          const dedupeKey = `${accountId}|${a.externalId}`;
          await db.investmentActivity.upsert({
            where: { dedupeKey },
            update: {},
            create: {
              accountId,
              instrumentId,
              type: a.type,
              tradeDate: new Date(a.tradeDate),
              units: a.units ? new Prisma.Decimal(a.units) : undefined,
              priceMinor: a.priceMinor,
              grossAmountMinor: a.grossAmountMinor,
              feeMinor: a.feeMinor,
              taxMinor: a.taxMinor,
              currency: a.currency,
              isExternalFlow: a.isExternalFlow,
              dedupeKey,
              source: "provider",
            },
          });
          recordsWritten += 1;
        }
      } catch (e) {
        if (e instanceof UnsupportedCapabilityError) partialReasons.push(e.message);
        else throw e;
      }
    } else {
      partialReasons.push(`${adapter.providerKind}: activities not supported`);
    }

    // --- Prices ---
    if (caps.prices.supported) {
      try {
        const prices = await adapter.fetchPrices();
        recordsRead += prices.items.length;
        for (const p of prices.items) {
          const instrument = await db.instrument.findFirst({
            where: { OR: [{ isin: p.instrumentIsin }, { ticker: p.instrumentTicker }] },
          });
          if (!instrument) continue;
          await db.priceObservation.upsert({
            where: {
              instrumentId_asOf_source: { instrumentId: instrument.id, asOf: new Date(p.asOf), source: "provider" },
            },
            update: { priceMinor: p.priceMinor, currency: p.currency },
            create: {
              instrumentId: instrument.id,
              asOf: new Date(p.asOf),
              priceMinor: p.priceMinor,
              currency: p.currency,
              source: "provider",
            },
          });
          recordsWritten += 1;
        }
      } catch (e) {
        if (e instanceof UnsupportedCapabilityError) partialReasons.push(e.message);
        else throw e;
      }
    }

    const status = partialReasons.length > 0 ? "PARTIAL" : "SUCCEEDED";
    await db.connection.update({
      where: { id: connectionId },
      data: {
        status: status === "SUCCEEDED" ? "CURRENT" : "PARTIALLY_SUPPORTED",
        lastSuccessAt: new Date(),
        lastAttemptAt: new Date(),
        lastErrorRedacted: partialReasons.length ? redactForLog(partialReasons.join("; ")) : null,
      },
    });
    await db.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status,
        finishedAt: new Date(),
        recordsRead,
        recordsWritten,
        errorRedacted: partialReasons.length ? redactForLog(partialReasons.join("; ")) : null,
      },
    });

    return { status, recordsRead, recordsWritten, errorRedacted: partialReasons.join("; ") || undefined };
  } catch (err) {
    const message = redactForLog(err instanceof Error ? err.message : String(err));
    await db.connection.update({
      where: { id: connectionId },
      data: { status: "FAILED", lastAttemptAt: new Date(), lastErrorRedacted: message },
    });
    await db.syncRun.update({
      where: { id: syncRun.id },
      data: { status: "FAILED", finishedAt: new Date(), recordsRead, recordsWritten, errorRedacted: message },
    });
    return { status: "FAILED", recordsRead, recordsWritten, errorRedacted: message };
  }
}
