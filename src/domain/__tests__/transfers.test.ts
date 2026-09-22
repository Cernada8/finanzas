import { describe, expect, it } from "vitest";
import { matchTransfers } from "../transfers";
import type { DomainAccount, DomainTransaction } from "../types";

const owner = "owner-1";

function acct(id: string, currency = "EUR"): DomainAccount {
  return { id, ownerId: owner, kind: "CASH", currency, includeInNetWorth: true, isLiability: false };
}

function tx(
  id: string,
  accountId: string,
  amountMinor: bigint,
  date: string,
  currency = "EUR"
): DomainTransaction {
  return {
    id,
    accountId,
    ownerId: owner,
    bookedDate: date,
    transactionDate: date,
    status: "BOOKED",
    amountMinor,
    currency,
    description: "transfer",
    economicClass: "UNRESOLVED",
  };
}

describe("matchTransfers", () => {
  it("matches a €1,000 transfer between two owned accounts on the same day", () => {
    const accounts = [acct("caixabank"), acct("traderepublic")];
    const txs = [tx("t1", "caixabank", -100000n, "2026-03-01"), tx("t2", "traderepublic", 100000n, "2026-03-01")];
    const matches = matchTransfers(txs, accounts);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ fromTxId: "t1", toTxId: "t2" });
    expect(matches[0].confidence).toBe(1);
  });

  it("does not match transactions within the same account", () => {
    const accounts = [acct("a")];
    const txs = [tx("t1", "a", -5000n, "2026-03-01"), tx("t2", "a", 5000n, "2026-03-01")];
    expect(matchTransfers(txs, accounts)).toHaveLength(0);
  });

  it("does not match transactions in different currencies (multi-currency transfer needs FX, not a naive amount match)", () => {
    const accounts = [acct("a", "EUR"), acct("b", "USD")];
    const txs = [tx("t1", "a", -10000n, "2026-03-01", "EUR"), tx("t2", "b", 10000n, "2026-03-01", "USD")];
    expect(matchTransfers(txs, accounts)).toHaveLength(0);
  });

  it("matches within a date window with decaying confidence, and not beyond it", () => {
    const accounts = [acct("a"), acct("b")];
    const txs = [tx("t1", "a", -2000n, "2026-03-01"), tx("t2", "b", 2000n, "2026-03-03")];
    const matches = matchTransfers(txs, accounts, { dateWindowDays: 3 });
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBeLessThan(1);

    const tooFar = matchTransfers(txs, accounts, { dateWindowDays: 1 });
    expect(tooFar).toHaveLength(0);
  });

  it("leaves an unmatched leg as unresolved when the counterpart account's history is missing (never invents income)", () => {
    const accounts = [acct("a")];
    const txs = [tx("t1", "a", 5000n, "2026-03-01")]; // inflow with no matching outflow anywhere
    expect(matchTransfers(txs, accounts)).toHaveLength(0);
  });
});
