/**
 * Adapter registry. Real provider adapters (CaixaBank/imagin PSD2, MyInvestor PSD2) are
 * intentionally NOT implemented in this build — see docs/integration-feasibility.md for why
 * production access could not be verified or obtained autonomously. Their ProviderKind values
 * exist in the schema and Connections UI so the "unconfigured" state is honest and visible,
 * rather than the institutions being absent entirely.
 *
 * Trade Republic has no adapter at all (not even an unconfigured stub with fake capabilities) —
 * only CSV/statement import is offered for it, per the brief's prohibition on reverse-engineered
 * clients as a default integration.
 */
import { DemoAdapter } from "./demo-adapter";
import type { ProviderAdapter } from "./types";

export type RegisteredProviderKind = "DEMO";

const registry: Record<RegisteredProviderKind, () => ProviderAdapter> = {
  DEMO: () => new DemoAdapter(),
};

/** Provider kinds that exist conceptually (for the Connections UI) but have no live adapter yet. */
export const UNCONFIGURED_PROVIDER_KINDS = [
  "CAIXABANK_PSD2",
  "IMAGIN_PSD2",
  "MYINVESTOR_PSD2",
] as const;

/** Deliberately absent even as an unconfigured stub — see file header. */
export const NEVER_INTEGRATED_PROVIDER_KINDS = ["TRADE_REPUBLIC_UNSUPPORTED"] as const;

export function getAdapter(kind: RegisteredProviderKind): ProviderAdapter {
  return registry[kind]();
}

export function isLiveAdapterAvailable(kind: string): kind is RegisteredProviderKind {
  return kind in registry;
}
