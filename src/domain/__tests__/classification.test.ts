import { describe, expect, it } from "vitest";
import { classify, validateSplits } from "../classification";

describe("classify — precedence: user > rule > provider", () => {
  const tx = {
    id: "t1",
    accountId: "a",
    description: "MERCADONA MADRID",
    merchant: "Mercadona",
    amountMinor: -4500n,
  };

  it("user-set classification always wins, even if rules would also match", () => {
    const rules = [
      {
        id: "r1",
        priority: 1,
        enabled: true,
        matchMerchant: "Mercadona",
        setCategoryId: "groceries",
        setEconomicClass: "EXPENSE",
      },
    ];
    const result = classify({ ...tx, userCategoryId: "user-chosen-category" }, rules);
    expect(result.source).toBe("user");
    expect(result.categoryId).toBe("user-chosen-category");
  });

  it("falls back to the first matching rule by priority when no user override exists", () => {
    const rules = [
      { id: "r2", priority: 5, enabled: true, matchDescriptionContains: "MERCADONA", setCategoryId: "wrong-lower-priority" },
      { id: "r1", priority: 1, enabled: true, matchMerchant: "Mercadona", setCategoryId: "groceries" },
    ];
    const result = classify(tx, rules);
    expect(result.source).toBe("rule");
    expect(result.appliedRuleId).toBe("r1");
    expect(result.categoryId).toBe("groceries");
  });

  it("skips disabled rules", () => {
    const rules = [{ id: "r1", priority: 1, enabled: false, matchMerchant: "Mercadona", setCategoryId: "groceries" }];
    const result = classify(tx, rules);
    expect(result.source).toBe("unresolved");
  });

  it("falls back to provider suggestion when no rule matches", () => {
    const result = classify(tx, [], { categoryId: "provider-guess" });
    expect(result.source).toBe("provider");
    expect(result.categoryId).toBe("provider-guess");
  });

  it("is unresolved when nothing matches", () => {
    const result = classify(tx, []);
    expect(result.source).toBe("unresolved");
    expect(result.categoryId).toBeNull();
  });
});

describe("validateSplits", () => {
  it("accepts splits that sum exactly to the parent amount", () => {
    expect(validateSplits(-10000n, [-6000n, -4000n])).toEqual({ valid: true, sumMinor: -10000n });
  });

  it("rejects splits that do not sum exactly", () => {
    expect(validateSplits(-10000n, [-6000n, -3999n]).valid).toBe(false);
  });
});
