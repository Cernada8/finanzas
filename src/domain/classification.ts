/**
 * Deterministic categorization rule engine (brief §5): user corrections outrank rules, which
 * outrank provider suggestions. Rule application is deterministic and explainable.
 */
export interface ClassificationRule {
  id: string;
  priority: number; // lower runs first
  enabled: boolean;
  matchDescriptionContains?: string | null;
  matchMerchant?: string | null;
  matchAccountId?: string | null;
  matchMinAmountMinor?: bigint | null;
  matchMaxAmountMinor?: bigint | null;
  setCategoryId?: string | null;
  setEconomicClass?: string | null;
}

export interface ClassifiableTransaction {
  id: string;
  accountId: string;
  description: string;
  merchant?: string | null;
  amountMinor: bigint;
  /** Present when a human has already set this explicitly — always wins, no rule runs. */
  userCategoryId?: string | null;
  userEconomicClass?: string | null;
}

export interface ClassificationOutcome {
  transactionId: string;
  categoryId: string | null;
  economicClass: string | null;
  source: "user" | "rule" | "provider" | "unresolved";
  appliedRuleId: string | null;
}

function ruleMatches(rule: ClassificationRule, tx: ClassifiableTransaction): boolean {
  if (!rule.enabled) return false;
  if (rule.matchDescriptionContains) {
    if (!tx.description.toLowerCase().includes(rule.matchDescriptionContains.toLowerCase())) {
      return false;
    }
  }
  if (rule.matchMerchant) {
    if ((tx.merchant ?? "").toLowerCase() !== rule.matchMerchant.toLowerCase()) return false;
  }
  if (rule.matchAccountId && rule.matchAccountId !== tx.accountId) return false;
  const abs = tx.amountMinor < 0n ? -tx.amountMinor : tx.amountMinor;
  if (rule.matchMinAmountMinor != null && abs < rule.matchMinAmountMinor) return false;
  if (rule.matchMaxAmountMinor != null && abs > rule.matchMaxAmountMinor) return false;
  return true;
}

/**
 * Deterministic: rules are evaluated in ascending `priority` order; the first match wins.
 * User-set fields always take precedence and skip rule evaluation entirely.
 */
export function classify(
  tx: ClassifiableTransaction,
  rules: ClassificationRule[],
  providerSuggestion?: { categoryId?: string | null; economicClass?: string | null }
): ClassificationOutcome {
  if (tx.userCategoryId != null || tx.userEconomicClass != null) {
    return {
      transactionId: tx.id,
      categoryId: tx.userCategoryId ?? null,
      economicClass: tx.userEconomicClass ?? null,
      source: "user",
      appliedRuleId: null,
    };
  }

  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    if (ruleMatches(rule, tx)) {
      return {
        transactionId: tx.id,
        categoryId: rule.setCategoryId ?? null,
        economicClass: rule.setEconomicClass ?? null,
        source: "rule",
        appliedRuleId: rule.id,
      };
    }
  }

  if (providerSuggestion?.categoryId || providerSuggestion?.economicClass) {
    return {
      transactionId: tx.id,
      categoryId: providerSuggestion.categoryId ?? null,
      economicClass: providerSuggestion.economicClass ?? null,
      source: "provider",
      appliedRuleId: null,
    };
  }

  return { transactionId: tx.id, categoryId: null, economicClass: null, source: "unresolved", appliedRuleId: null };
}

/** Splits must sum exactly to the parent transaction amount. */
export function validateSplits(parentAmountMinor: bigint, splitAmountsMinor: bigint[]): { valid: boolean; sumMinor: bigint } {
  const sum = splitAmountsMinor.reduce((a, b) => a + b, 0n);
  return { valid: sum === parentAmountMinor, sumMinor: sum };
}
