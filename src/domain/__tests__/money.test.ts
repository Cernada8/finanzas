import { describe, expect, it } from "vitest";
import { add, fromMinor, toMinor, convert, safeRatio, money, CurrencyMismatchError } from "../money";
import Decimal from "decimal.js";

describe("money", () => {
  it("round-trips minor units without float error", () => {
    const m = fromMinor(123456n, "EUR");
    expect(m.amount.toString()).toBe("1234.56");
    expect(toMinor(m)).toBe(123456n);
  });

  it("never uses binary float for a classic precision trap (0.1 + 0.2)", () => {
    const a = fromMinor(10n, "EUR"); // 0.10
    const b = fromMinor(20n, "EUR"); // 0.20
    const sum = add(a, b);
    expect(sum.amount.toString()).toBe("0.3");
    expect(toMinor(sum)).toBe(30n);
  });

  it("throws on cross-currency arithmetic without explicit conversion", () => {
    const eur = fromMinor(100n, "EUR");
    const usd = fromMinor(100n, "USD");
    expect(() => add(eur, usd)).toThrow(CurrencyMismatchError);
  });

  it("converts using a timestamped FX rate", () => {
    const usd = money(100, "USD");
    const eur = convert(usd, "EUR", new Decimal("0.92"));
    expect(eur.amount.toString()).toBe("92");
    expect(eur.currency).toBe("EUR");
  });

  it("safeRatio is undefined for zero/negative denominators", () => {
    expect(safeRatio(10, 0)).toBeUndefined();
    expect(safeRatio(10, -5)).toBeUndefined();
    expect(safeRatio(10, 2)!.toString()).toBe("5");
  });
});
