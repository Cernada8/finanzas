# Financial methodology

Every definition below is implemented in `src/domain/*` (framework-free, unit tested — see
`src/domain/__tests__/`) and nowhere else; `src/server/services/reporting.ts` only queries and
hands numbers to these functions. If a UI number and this document disagree, the code is the bug.

## Money, units, prices, FX

All amounts are stored as integer minor units (`BigInt`, e.g. euro cents) in Postgres and converted
to `Decimal` (decimal.js, 40 significant digits, banker's rounding) only inside the domain layer for
arithmetic — see `src/domain/money.ts`. Binary floating point is never used for money. Combining two
`Money` values of different currencies without an explicit `convert()` call throws
`CurrencyMismatchError` rather than silently producing a wrong number.

## Spending & cash flow (`src/domain/spending.ts`)

- **Booked date drives monthly reporting.** `Transaction.bookedDate` is what's grouped by month;
  `Transaction.status = PENDING` rows are excluded from booked totals entirely (they're shown
  separately in the UI, never folded into a total).
- **Economic classification is independent of the user's category.** Every transaction has an
  `economicClass`: `INCOME | EXPENSE | REFUND | INTERNAL_TRANSFER | INVESTMENT_CASH_FLOW |
  UNRESOLVED`. A transaction can be miscategorized (wrong bucket, e.g. "Groceries" vs. "Household")
  without ever being misclassified (spending counted as a transfer, or vice versa) — the two are
  set independently, and the domain layer only reads `economicClass`.
- **Transfers between owned accounts are excluded, never invented.** `src/domain/transfers.ts`
  matches opposite legs (equal-and-opposite signed amount, same currency, both accounts owned by the
  same owner, within a date window) and flags them `INTERNAL_TRANSFER`. A leg with no matching
  counterpart stays whatever it was (usually `UNRESOLVED`) — it is never assumed to be income just
  because no outgoing match was found.
- **Net spending = gross booked expense magnitude − eligible refunds**, where refunds reduce
  spending **in their own booked month** (not retroactively in the original purchase's month) unless
  a caller explicitly links a refund to its purchase via `Transaction.refundOfId`.
- **Operating savings = operating income − net spending**, with investment income (dividends,
  interest) tracked as a separate figure (`investmentIncomeMinor`), never blended into operating
  income. **Savings rate = operating savings / operating income**, reported as unavailable
  (`null`, rendered "—") when operating income is zero or negative — never divided by a
  non-positive number.
- **Credit-card purchases count once.** A card purchase is `EXPENSE` on the card account; its
  repayment (checking -> card) is `INTERNAL_TRANSFER` on both legs when both accounts are tracked —
  see the "€100 card purchase + €100 repayment" test in `spending.test.ts`.
- **Cash withdrawals** move money into a tracked cash wallet if one exists, or otherwise remain an
  unresolved/expense outflow from the source account — this build never claims to know what
  withdrawn cash was later spent on.
- **Equal-elapsed-day comparison**: a partial month (e.g. 10 of 31 days elapsed) is never compared
  directly against a closed month. `equalElapsedDayProjection()` scales the partial total by
  `daysInMonth / elapsedDays` and the UI labels it explicitly as a projection, not a committed
  total (`isPartialMonth` flag, shown on the Spending page).

## Investments (`src/domain/investments.ts`, `performance.ts`)

- **Current security value = units × price, converted to the reporting currency with a timestamped
  FX rate** (`valueHolding()`). A missing price or missing FX rate excludes that holding from
  valuation and totals — it is reported as a data-quality warning ("no price observation"), never
  silently valued at zero or skipped in a way that inflates the remaining weights.
- **Two distinct denominators, never confused:**
  - *Security allocation* = one security's value ÷ **total included securities value**
    (`computeSecurityAllocations`).
  - *Investment share* = invested securities value ÷ **included financial assets** (securities +
    broker cash) (`computeInvestmentShare`).
- **Unrealized gain = current value − remaining cost basis**; its percentage divides by cost basis
  and is `null` (shown "unavailable") when the basis is missing or ≤ 0 — never guessed.
- **Realized gain** is computed per disposal (`computeRealizedGain`) using an **analytical FIFO lot
  policy** (`consumeFifo`) — explicitly documented here as *not* Spanish tax accounting (which has
  its own averaging/lot rules); this is a portfolio-analytics FIFO, kept separate from any future
  tax-reporting feature.
- **Tracked net worth = included assets − included liabilities**, computed from a
  caller-deduplicated asset total (`computeTrackedNetWorth`) specifically to avoid the double-count
  failure mode of counting broker cash once inside a holdings subtotal and again as its own line, or
  counting a subtotal alongside the line items it's made of.
- **Performance metrics (TWR, XIRR) are opt-in and can refuse to compute:**
  - `computeTwr()` chains subperiod returns between valuation points that bracket every external
    flow. If any flow date has no bracketing valuation, it returns `{ available: false, reason }`
    instead of approximating — the UI never shows a TWR number it can't stand behind.
  - `computeXirr()` solves via bisection over a wide bracket; it returns `available: false` when
    there's no external flow, when all flows share one sign (mathematically degenerate), or when no
    sign change is found in the search bracket (would-be-ambiguous root). Annualized figures always
    carry the period they're computed over; short periods are not silently annualized as if they were
    representative.
  - Internal trades/transfers between an owner's own included investment accounts, and dividends
    retained inside the measured portfolio, are never treated as external flows for XIRR/TWR
    purposes — only `InvestmentActivity.isExternalFlow = true` rows count.

## Why the running demo app doesn't show TWR/XIRR

The Investments page explains this inline: the seeded demo data doesn't yet have enough *bracketed*
valuation history (a valuation point on every flow date) for `computeTwr`/`computeXirr` to return
`available: true`. This is the correct behavior per the rule above, not a missing feature — the
functions exist, are unit tested (`performance.test.ts`), and will populate the moment enough dated
history exists (either from a longer-running sync or from importing historical statements).

## Required scenarios and where they're proven

Every scenario named in the brief's §8 has a corresponding unit test, verified passing as part of
this delivery (`npm run test`, 56/56 passing):

| Scenario | Test |
| --- | --- |
| €1,000 CaixaBank -> Trade Republic transfer: zero spending, zero income | `spending.test.ts` |
| €300 supermarket + €50 refund -> €250 net spending | `spending.test.ts` |
| €100 card purchase + €100 repayment -> €100 spending (both accounts tracked) | `spending.test.ts` |
| €1,000 securities purchase: cash->investment movement, not consumption | `spending.test.ts` |
| Repeated imports / overlapping history / duplicates / pending->booked replacement | `transactions-import.test.ts`, `commit.ts` (idempotency via dedupeKey), `sync.ts` (upsert semantics) |
| Month boundaries, partial history, es-ES decimal formats | `spending.test.ts`, `locale.test.ts` |
| Multi-currency transfers, missing FX | `transfers.test.ts` ("different currencies" case), `investments.test.ts` / `reporting.ts` (missing-FX exclusion) |
| Missing cost basis | `investments.test.ts` |
| Allocation denominators, net-worth double counting | `investments.test.ts` |
| Realized/unrealized separation | `investments.test.ts` |
| Splits sum exactly | `classification.test.ts` (`validateSplits`) |
| Performance formulas vs. independently calculated reference cases | `performance.test.ts` (hand-computed 10%+10% chained TWR = 21%; single-flow XIRR ≈ 10%) |

Partial-provider-failure, revoked-consent, and concurrent-sync scenarios are exercised at the
*sync-orchestration* level (`runSync`'s per-capability try/catch and `PARTIAL` status), not as
domain-layer unit tests, since they're about I/O sequencing rather than a calculation — see
`docs/architecture.md#sync-orchestration`.
