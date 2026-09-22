import { describe, expect, it } from "vitest";
import { computeTwr, computeXirr } from "../performance";

describe("computeTwr", () => {
  it("chains subperiod returns around a bracketed external flow", () => {
    // Start 100,000; grows 10% to 110,000 (ex-flow); a 10,000 contribution lands, so the
    // valuation recorded on that date is 120,000; grows 10% again to 132,000, no more flows.
    const points = [
      { date: "2026-01-01", valueMinor: 100_000_00n },
      { date: "2026-02-01", valueMinor: 120_000_00n }, // after the +10,000 flow
      { date: "2026-03-01", valueMinor: 132_000_00n },
    ];
    const flows = [{ date: "2026-02-01", amountMinor: 10_000_00n }];
    const result = computeTwr(points, flows, { minDaysToAnnualize: 9999 });
    expect(result.available).toBe(true);
    // (1.10 * 1.10) - 1 = 0.21
    expect(result.totalReturn!.toDecimalPlaces(6).toString()).toBe("0.21");
  });

  it("is unavailable when a flow date has no bracketing valuation point", () => {
    const points = [
      { date: "2026-01-01", valueMinor: 100_000_00n },
      { date: "2026-03-01", valueMinor: 132_000_00n },
    ];
    const flows = [{ date: "2026-02-01", amountMinor: 10_000_00n }];
    const result = computeTwr(points, flows);
    expect(result.available).toBe(false);
  });

  it("is unavailable with fewer than two valuation points", () => {
    const result = computeTwr([{ date: "2026-01-01", valueMinor: 1000n }], []);
    expect(result.available).toBe(false);
  });
});

describe("computeXirr", () => {
  it("solves a simple single-contribution, single-terminal-value case", () => {
    // Invest 1000 on day 0, worth 1100 exactly one year later => ~10% XIRR
    const flows = [{ date: "2025-01-01", amountMinor: -100_000n }];
    const result = computeXirr(flows, 110_000n, "2026-01-01");
    expect(result.available).toBe(true);
    expect(result.rate!.toDecimalPlaces(2).toNumber()).toBeCloseTo(0.1, 1);
  });

  it("is unavailable when there is no external flow", () => {
    const result = computeXirr([], 100_000n, "2026-01-01");
    expect(result.available).toBe(false);
  });

  it("is unavailable when all flows have the same sign (degenerate — no solution)", () => {
    const flows = [{ date: "2025-01-01", amountMinor: 100_000n }];
    const result = computeXirr(flows, 50_000n, "2026-01-01");
    expect(result.available).toBe(false);
  });
});
