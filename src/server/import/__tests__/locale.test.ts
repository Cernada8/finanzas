import { describe, expect, it } from "vitest";
import { parseLocaleAmount, parseLocaleDate } from "../locale";

describe("parseLocaleAmount", () => {
  it("parses Spanish-formatted amounts (dot thousands, comma decimal)", () => {
    expect(parseLocaleAmount("1.234,56", "es-ES").minor).toBe(123456n);
    expect(parseLocaleAmount("-45,20", "es-ES").minor).toBe(-4520n);
    expect(parseLocaleAmount("1.000.000,00", "es-ES").minor).toBe(100000000n);
  });

  it("parses US-formatted amounts (comma thousands, dot decimal)", () => {
    expect(parseLocaleAmount("1,234.56", "en-US").minor).toBe(123456n);
    expect(parseLocaleAmount("-45.20", "en-US").minor).toBe(-4520n);
  });

  it("handles a currency symbol and parentheses-as-negative", () => {
    expect(parseLocaleAmount("€45,20", "es-ES").minor).toBe(4520n);
    expect(parseLocaleAmount("(45,20)", "es-ES").minor).toBe(-4520n);
  });

  it("handles amounts without a decimal part", () => {
    expect(parseLocaleAmount("1.234", "es-ES").minor).toBe(123400n);
  });

  it("rejects unparseable input rather than guessing", () => {
    expect(parseLocaleAmount("not a number", "es-ES").ok).toBe(false);
    expect(parseLocaleAmount("", "es-ES").ok).toBe(false);
  });
});

describe("parseLocaleDate", () => {
  it("accepts ISO dates regardless of locale", () => {
    expect(parseLocaleDate("2026-03-15", "es-ES").isoDate).toBe("2026-03-15");
    expect(parseLocaleDate("2026-03-15", "en-US").isoDate).toBe("2026-03-15");
  });

  it("parses dd/mm/yyyy under es-ES", () => {
    expect(parseLocaleDate("15/03/2026", "es-ES").isoDate).toBe("2026-03-15");
  });

  it("parses mm/dd/yyyy under en-US — the same digits mean a different date", () => {
    expect(parseLocaleDate("03/15/2026", "en-US").isoDate).toBe("2026-03-15");
    // 15/03 has no valid en-US interpretation as month=15
    expect(parseLocaleDate("15/03/2026", "en-US").ok).toBe(false);
  });

  it("expands 2-digit years", () => {
    expect(parseLocaleDate("15/03/26", "es-ES").isoDate).toBe("2026-03-15");
  });

  it("rejects unparseable dates", () => {
    expect(parseLocaleDate("not a date", "es-ES").ok).toBe(false);
  });
});
