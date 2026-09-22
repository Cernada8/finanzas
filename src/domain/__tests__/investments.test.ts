import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  valueHolding,
  computeSecurityAllocations,
  computeInvestmentShare,
  computeUnrealizedGain,
  computeRealizedGain,
  consumeFifo,
  computeTrackedNetWorth,
} from "../investments";

describe("valueHolding", () => {
  it("values units at price with FX conversion, never using today's quote for a historical date implicitly", () => {
    const v = valueHolding({
      units: "10",
      priceMinor: 15000n, // $150.00
      priceCurrency: "USD",
      reportingCurrency: "EUR",
      fxRate: "0.92",
    });
    // 10 * 150 = 1500 USD; * 0.92 = 1380 EUR = 138000 minor
    expect(v.currentValueReportingMinor).toBe(138000n);
  });
});

describe("allocation denominators", () => {
  it("security allocation uses total included securities value only", () => {
    const result = computeSecurityAllocations([
      { securityId: "a", valueReportingMinor: 60000n },
      { securityId: "b", valueReportingMinor: 40000n },
    ]);
    expect(result[0].allocationOfSecurities!.toString()).toBe("0.6");
    expect(result[1].allocationOfSecurities!.toString()).toBe("0.4");
  });

  it("returns null allocation when total is zero rather than dividing by zero", () => {
    const result = computeSecurityAllocations([{ securityId: "a", valueReportingMinor: 0n }]);
    expect(result[0].allocationOfSecurities).toBeNull();
  });

  it("investment share uses invested securities / included financial assets (a distinct denominator from security allocation)", () => {
    const share = computeInvestmentShare(80000n, 100000n); // 80% invested, 20% broker cash
    expect(share!.toString()).toBe("0.8");
  });

  it("investment share is unavailable when included financial assets is nonpositive", () => {
    expect(computeInvestmentShare(0n, 0n)).toBeNull();
  });
});

describe("realized vs unrealized gain separation", () => {
  it("unrealized gain uses remaining cost basis and is unavailable when basis is missing", () => {
    const withBasis = computeUnrealizedGain({ currentValueMinor: 150000n, remainingCostBasisMinor: 100000n });
    expect(withBasis.unrealizedGainMinor).toBe(50000n);
    expect(withBasis.unrealizedGainPct!.toString()).toBe("0.5");

    const noBasis = computeUnrealizedGain({ currentValueMinor: 150000n, remainingCostBasisMinor: null });
    expect(noBasis.unrealizedGainMinor).toBeNull();
    expect(noBasis.unrealizedGainPct).toBeNull();
  });

  it("unrealized gain percentage is unavailable when cost basis is nonpositive", () => {
    const result = computeUnrealizedGain({ currentValueMinor: 5000n, remainingCostBasisMinor: 0n });
    expect(result.unrealizedGainMinor).toBe(5000n);
    expect(result.unrealizedGainPct).toBeNull();
  });

  it("realized gain from a disposal is separate from unrealized gain on remaining holdings", () => {
    const realized = computeRealizedGain({ proceedsMinor: 60000n, costBasisMinor: 40000n });
    expect(realized).toBe(20000n);
    expect(computeRealizedGain({ proceedsMinor: 60000n, costBasisMinor: null })).toBeNull();
  });
});

describe("FIFO lot consumption (documented analytical policy, not tax accounting)", () => {
  it("consumes the oldest lot first and splits a partially-consumed lot", () => {
    const lots = [
      { units: new Decimal(5), costBasisMinor: 50000n }, // 5 units @ avg 100/unit basis
      { units: new Decimal(5), costBasisMinor: 60000n }, // 5 units @ avg 120/unit basis
    ];
    const { costBasisConsumedMinor, remainingLots } = consumeFifo(lots, new Decimal(7));
    // First lot fully consumed (50000) + 2/5 of second lot (24000) = 74000
    expect(costBasisConsumedMinor).toBe(74000n);
    expect(remainingLots).toHaveLength(1);
    expect(remainingLots[0].units.toString()).toBe("3");
    expect(remainingLots[0].costBasisMinor).toBe(36000n);
  });
});

describe("tracked net worth avoids double counting", () => {
  it("subtracts liabilities from a caller-deduplicated asset total", () => {
    expect(computeTrackedNetWorth(500000n, 120000n)).toBe(380000n);
  });
});
