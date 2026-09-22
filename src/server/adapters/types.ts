/**
 * Capability-based provider adapter interface (brief §3).
 *
 * Every adapter declares which capabilities it supports. A capability that is not supported
 * returns `{ supported: false }` — it must NEVER be simulated with an empty successful result,
 * because "no data" and "not supported" mean different things to the UI and to net-worth math
 * (an absent holding is not zero unless a complete authoritative snapshot confirms it).
 */

export type Capability = "accounts" | "balances" | "transactions" | "holdings" | "activities" | "prices";

export interface CapabilityDeclaration {
  supported: boolean;
  historyDepthDays?: number;
  notes?: string;
}

export interface AdapterCapabilities {
  accounts: CapabilityDeclaration;
  balances: CapabilityDeclaration;
  transactions: CapabilityDeclaration;
  holdings: CapabilityDeclaration;
  activities: CapabilityDeclaration;
  prices: CapabilityDeclaration;
}

export interface RawAccount {
  externalId: string;
  name: string;
  kind: "CASH" | "CARD" | "BROKERAGE_CASH" | "INVESTMENT" | "LOAN" | "OTHER";
  currency: string;
}

export interface RawBalance {
  accountExternalId: string;
  asOf: string; // ISO date-time
  bookedMinor: bigint;
  pendingMinor: bigint;
  currency: string;
}

export interface RawTransaction {
  accountExternalId: string;
  externalId: string;
  transactionDate: string; // ISO date, date-only, no timezone shifting
  bookedDate: string | null;
  status: "PENDING" | "BOOKED";
  amountMinor: bigint;
  currency: string;
  description: string;
  merchant?: string;
}

export interface RawHolding {
  accountExternalId: string;
  instrumentIsin?: string;
  instrumentTicker?: string;
  instrumentName: string;
  assetType: "EQUITY" | "ETF" | "FUND" | "BOND" | "CRYPTO" | "CASH" | "OTHER";
  asOf: string;
  units: string; // decimal string
  costBasisMinor?: bigint;
  costBasisCcy?: string;
  isAuthoritativeComplete: boolean;
}

export interface RawActivity {
  accountExternalId: string;
  externalId: string;
  instrumentIsin?: string;
  instrumentName?: string;
  type: "BUY" | "SELL" | "DIVIDEND" | "INTEREST" | "FEE" | "TAX" | "TRANSFER_IN" | "TRANSFER_OUT" | "CORPORATE_ACTION";
  tradeDate: string;
  units?: string;
  priceMinor?: bigint;
  grossAmountMinor: bigint;
  feeMinor: bigint;
  taxMinor: bigint;
  currency: string;
  isExternalFlow: boolean;
}

export interface RawPrice {
  instrumentIsin?: string;
  instrumentTicker?: string;
  asOf: string;
  priceMinor: bigint;
  currency: string;
}

export interface SyncCheckpoint {
  [capability: string]: unknown;
}

export interface SyncResult<T> {
  items: T[];
  nextCheckpoint?: SyncCheckpoint;
  hasMore: boolean;
}

/**
 * A provider adapter. All network calls happen server-side only (brief §7); no adapter method
 * ever exposes raw credentials to the caller.
 */
export interface ProviderAdapter {
  readonly providerKind: string;
  readonly displayName: string;

  capabilities(): AdapterCapabilities;

  fetchAccounts(): Promise<SyncResult<RawAccount>>;
  fetchBalances(checkpoint?: SyncCheckpoint): Promise<SyncResult<RawBalance>>;
  fetchTransactions(checkpoint?: SyncCheckpoint): Promise<SyncResult<RawTransaction>>;
  fetchHoldings(checkpoint?: SyncCheckpoint): Promise<SyncResult<RawHolding>>;
  fetchActivities(checkpoint?: SyncCheckpoint): Promise<SyncResult<RawActivity>>;
  fetchPrices(checkpoint?: SyncCheckpoint): Promise<SyncResult<RawPrice>>;
}

export const UNSUPPORTED: CapabilityDeclaration = { supported: false };

/**
 * Thrown by an adapter's fetch* method when called for a capability it does not support.
 * Callers MUST check `capabilities()` first; this exists as a hard backstop so an unsupported
 * capability can never be mistaken for "checked, and there's nothing there" (an empty successful
 * result). Sync orchestration code catches this and marks the sync PARTIAL/PARTIALLY_SUPPORTED
 * rather than writing a zero/empty snapshot.
 */
export class UnsupportedCapabilityError extends Error {
  constructor(providerKind: string, capability: Capability) {
    super(`${providerKind} does not support capability "${capability}".`);
    this.name = "UnsupportedCapabilityError";
  }
}
