/**
 * Demo adapter: deterministic, clearly-synthetic data for the isolated demo workspace
 * (WORKSPACE_MODE=demo -> DATABASE_URL_DEMO). Never used against the live database.
 *
 * This is a fully "supported" adapter across all capabilities — unlike real providers, its point
 * is to exercise every UI path (spending, investments, drilldowns, data-quality states) with
 * internally consistent synthetic numbers, clearly labeled as demo data everywhere in the UI.
 */
import {
  AdapterCapabilities,
  ProviderAdapter,
  RawAccount,
  RawActivity,
  RawBalance,
  RawHolding,
  RawPrice,
  RawTransaction,
  SyncResult,
} from "./types";

const SUPPORTED = { supported: true } as const;

export class DemoAdapter implements ProviderAdapter {
  readonly providerKind = "DEMO";
  readonly displayName = "Demo Bank (synthetic data)";

  capabilities(): AdapterCapabilities {
    return {
      accounts: SUPPORTED,
      balances: SUPPORTED,
      transactions: { supported: true, historyDepthDays: 400 },
      holdings: SUPPORTED,
      activities: { supported: true, historyDepthDays: 400 },
      prices: SUPPORTED,
    };
  }

  async fetchAccounts(): Promise<SyncResult<RawAccount>> {
    return {
      hasMore: false,
      items: [
        { externalId: "demo-checking", name: "Demo Checking (imagin)", kind: "CASH", currency: "EUR" },
        { externalId: "demo-card", name: "Demo Credit Card", kind: "CARD", currency: "EUR" },
        { externalId: "demo-broker-cash", name: "Demo Broker Cash (Trade Republic)", kind: "BROKERAGE_CASH", currency: "EUR" },
        { externalId: "demo-broker-invest", name: "Demo Investment Account (Trade Republic)", kind: "INVESTMENT", currency: "EUR" },
        { externalId: "demo-myinvestor-invest", name: "Demo Investment Account (MyInvestor)", kind: "INVESTMENT", currency: "EUR" },
      ],
    };
  }

  async fetchBalances(): Promise<SyncResult<RawBalance>> {
    const asOf = new Date().toISOString();
    return {
      hasMore: false,
      items: [
        { accountExternalId: "demo-checking", asOf, bookedMinor: 312450n, pendingMinor: -1200n, currency: "EUR" },
        { accountExternalId: "demo-card", asOf, bookedMinor: -48230n, pendingMinor: 0n, currency: "EUR" },
        { accountExternalId: "demo-broker-cash", asOf, bookedMinor: 154300n, pendingMinor: 0n, currency: "EUR" },
      ],
    };
  }

  async fetchTransactions(): Promise<SyncResult<RawTransaction>> {
    // A representative month of synthetic transactions, deliberately including: salary income,
    // groceries, a refund, a card purchase + repayment transfer, an internal transfer to the
    // broker, and one uncategorized item — enough to exercise every classification path.
    const items: RawTransaction[] = [
      tx("demo-checking", "sal-1", "2026-09-01", 250000n, "NOMINA EMPRESA SL"),
      tx("demo-checking", "rent-1", "2026-09-02", -110000n, "TRANSFERENCIA ALQUILER PISO"),
      tx("demo-checking", "groc-1", "2026-09-04", -8734n, "MERCADONA MADRID"),
      tx("demo-checking", "groc-2", "2026-09-11", -9820n, "MERCADONA MADRID"),
      tx("demo-checking", "refund-1", "2026-09-12", 1500n, "ABONO DEVOLUCION ZARA"),
      tx("demo-checking", "restaurant-1", "2026-09-06", -4250n, "RESTAURANTE EL RINCON"),
      tx("demo-checking", "gym-1", "2026-09-05", -3900n, "CUOTA GIMNASIO FUENLABRADA"),
      tx("demo-checking", "xfer-out-1", "2026-09-08", -100000n, "TRASPASO A TRADE REPUBLIC"),
      tx("demo-broker-cash", "xfer-in-1", "2026-09-08", 100000n, "INCOMING TRANSFER"),
      tx("demo-checking", "card-pay-1", "2026-09-15", -25000n, "PAGO TARJETA VISA"),
      tx("demo-card", "card-repay-1", "2026-09-15", 25000n, "PAGO RECIBIDO"),
      tx("demo-card", "card-purchase-1", "2026-09-03", -25000n, "EL CORTE INGLES"),
      tx("demo-checking", "mystery-1", "2026-09-18", -1999n, "PAYPAL *UNKNOWNMRCH"),
      tx("demo-checking", "cash-wd-1", "2026-09-20", -6000n, "REINTEGRO CAJERO FUENLABRADA"),
    ];
    return { items, hasMore: false };
  }

  async fetchHoldings(): Promise<SyncResult<RawHolding>> {
    const asOf = "2026-09-17";
    return {
      hasMore: false,
      items: [
        {
          accountExternalId: "demo-broker-invest",
          instrumentIsin: "IE00B4L5Y983",
          instrumentName: "iShares Core MSCI World UCITS ETF",
          assetType: "ETF",
          asOf,
          units: "42.5",
          costBasisMinor: 320000n,
          costBasisCcy: "EUR",
          isAuthoritativeComplete: true,
        },
        {
          accountExternalId: "demo-broker-invest",
          instrumentIsin: "US0378331005",
          instrumentName: "Apple Inc.",
          assetType: "EQUITY",
          asOf,
          units: "8",
          costBasisMinor: 120000n,
          costBasisCcy: "EUR",
          isAuthoritativeComplete: true,
        },
        {
          accountExternalId: "demo-myinvestor-invest",
          instrumentIsin: "LU1781541179",
          instrumentName: "Amundi MSCI Emerging Markets ETF",
          assetType: "FUND",
          asOf,
          units: "120",
          // Cost basis intentionally omitted here to exercise the "missing cost basis" state.
          isAuthoritativeComplete: true,
        },
      ],
    };
  }

  async fetchActivities(): Promise<SyncResult<RawActivity>> {
    return {
      hasMore: false,
      items: [
        {
          accountExternalId: "demo-broker-invest",
          externalId: "act-1",
          instrumentIsin: "IE00B4L5Y983",
          instrumentName: "iShares Core MSCI World UCITS ETF",
          type: "BUY",
          tradeDate: "2026-06-01",
          units: "42.5",
          priceMinor: 752900n,
          grossAmountMinor: -320000n,
          feeMinor: 100n,
          taxMinor: 0n,
          currency: "EUR",
          isExternalFlow: true,
        },
        {
          accountExternalId: "demo-broker-invest",
          externalId: "act-2",
          instrumentIsin: "US0378331005",
          instrumentName: "Apple Inc.",
          type: "DIVIDEND",
          tradeDate: "2026-08-15",
          grossAmountMinor: 1840n,
          feeMinor: 0n,
          taxMinor: 276n,
          currency: "EUR",
          isExternalFlow: false,
        },
      ],
    };
  }

  async fetchPrices(): Promise<SyncResult<RawPrice>> {
    return {
      hasMore: false,
      items: [
        { instrumentIsin: "IE00B4L5Y983", asOf: "2026-09-17", priceMinor: 812400n, currency: "EUR" },
        { instrumentIsin: "US0378331005", asOf: "2026-09-17", priceMinor: 21350n, currency: "USD" },
        { instrumentIsin: "LU1781541179", asOf: "2026-09-17", priceMinor: 9850n, currency: "EUR" },
      ],
    };
  }
}

function tx(
  accountExternalId: string,
  externalId: string,
  date: string,
  amountMinor: bigint,
  description: string
): RawTransaction {
  return {
    accountExternalId,
    externalId,
    transactionDate: date,
    bookedDate: date,
    status: "BOOKED",
    amountMinor,
    currency: "EUR",
    description,
  };
}
