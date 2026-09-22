/**
 * Transfer matching (brief §5): transfers between owned accounts are neither
 * income nor spending. Opposite legs are matched by ownership + amount +
 * currency + a date window; uncertain matches are surfaced for review rather
 * than silently classified either way. Missing counterpart history is never
 * treated as a reason to invent income.
 */
import type { DomainAccount, DomainTransaction, TransferCandidate } from "./types";

export interface MatchTransfersOptions {
  /** Max days between the two legs' dates to be considered a candidate. */
  dateWindowDays?: number;
}

/**
 * Pure function: given all of one owner's transactions and accounts, find
 * candidate transfer pairs. Does not mutate input or decide persistence.
 *
 * A pair (a, b) is a candidate transfer when:
 *  - a.accountId !== b.accountId, both accounts belong to the same owner
 *  - a.amountMinor === -b.amountMinor (equal and opposite, same currency)
 *  - |date(a) - date(b)| <= dateWindowDays
 *  - neither leg has already been consumed by a higher-confidence match
 *
 * Confidence starts at 1.0 for same-day matches and decays with date
 * distance; it never exceeds 1.0 and matches beyond the window are excluded
 * entirely (they become "uncertain" candidates for manual review upstream,
 * not silently confirmed or silently dropped).
 */
export function matchTransfers(
  transactions: DomainTransaction[],
  accounts: DomainAccount[],
  options: MatchTransfersOptions = {}
): TransferCandidate[] {
  const dateWindowDays = options.dateWindowDays ?? 3;
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const candidates: TransferCandidate[] = [];
  const consumed = new Set<string>();

  // Group by absolute amount + currency for efficient pairing.
  const buckets = new Map<string, DomainTransaction[]>();
  for (const tx of transactions) {
    const acct = accountById.get(tx.accountId);
    if (!acct) continue;
    const key = `${tx.amountMinor < 0n ? -tx.amountMinor : tx.amountMinor}|${tx.currency}`;
    const arr = buckets.get(key) ?? [];
    arr.push(tx);
    buckets.set(key, arr);
  }

  for (const bucket of buckets.values()) {
    const outflows = bucket.filter((t) => t.amountMinor < 0n);
    const inflows = bucket.filter((t) => t.amountMinor > 0n);

    // Sort for deterministic, stable matching (closest date first).
    for (const out of outflows) {
      if (consumed.has(out.id)) continue;
      const outAcct = accountById.get(out.accountId)!;
      const outDate = new Date(out.bookedDate ?? out.transactionDate);

      let best: { tx: DomainTransaction; distanceDays: number } | undefined;
      for (const inTx of inflows) {
        if (consumed.has(inTx.id)) continue;
        if (inTx.accountId === out.accountId) continue; // must be a different account
        if (inTx.ownerId !== out.ownerId) continue;
        const inAcct = accountById.get(inTx.accountId);
        if (!inAcct || inAcct.ownerId !== outAcct.ownerId) continue;

        const inDate = new Date(inTx.bookedDate ?? inTx.transactionDate);
        const distanceDays = Math.abs(
          (inDate.getTime() - outDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (distanceDays > dateWindowDays) continue;
        if (!best || distanceDays < best.distanceDays) {
          best = { tx: inTx, distanceDays };
        }
      }

      if (best) {
        consumed.add(out.id);
        consumed.add(best.tx.id);
        const confidence = Math.max(0, 1 - best.distanceDays / (dateWindowDays + 1));
        candidates.push({
          fromTxId: out.id,
          toTxId: best.tx.id,
          confidence,
          matchedBy:
            best.distanceDays === 0
              ? "amount+currency+same-day"
              : `amount+currency+date-window(${best.distanceDays}d)`,
        });
      }
    }
  }

  return candidates;
}
