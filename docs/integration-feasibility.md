# Integration feasibility — CaixaBank / imagin, MyInvestor, Trade Republic

Researched 17 September 2026 (web search + primary-source fetches, this session). This is a
feasibility assessment, not a confirmation of working production access. **Revalidate before
relying on any of this**, especially anything marked "documented" rather than "sandbox verified" or
"production verified" — official portals change onboarding terms without notice, and none of the
sources below were tested with real credentials in this session (none were available).

## Summary recommendation

Ship with **no live bank/broker adapters enabled by default**. Use the demo-mode adapter for
exploration and the CSV/XLSX import pipeline as the real, working way to get real data in today.
Leave the adapter interface ready for CaixaBank and MyInvestor's PSD2 AIS APIs (accounts/balances/
transactions only) as the most plausible next step *if* the user completes TPP/AISP registration —
that is a regulatory and business decision outside what this session can make or verify, so it is
not wired up with real credentials. Trade Republic has no verified supported personal-portfolio API
and is deliberately not implemented as a live adapter (see below) — its data comes in via
statement/CSV import only.

## Per-institution findings

### CaixaBank — banking (accounts, balances, movements)

- **Evidence level: documented.** CaixaBank operates an official API Store
  (https://www.caixabank.es/empresa/bancadistancia/api-store_ca.html) and is listed as a node on the
  Redsys PSD2 XS2A marketplace
  (https://market.apis-i.redsys.es/psd2/xs2a/nodos/caixabank), which is the shared PSD2 AIS/PIS
  gateway used by many Spanish banks including MyInvestor. Redsys documents a general access guide
  (https://market.apis-i.redsys.es/psd2/xs2a/guia) and a sandbox.
- **What's confirmed:** the existence of a documented AIS surface (account movements, balances) and
  a sandbox.
- **What's NOT confirmed:** whether an individual (non-licensed) developer can obtain *production*
  access. PSD2 AIS production access is normally restricted to a regulated AISP (Account Information
  Service Provider) or an agent/subcontractor of one — a natural person building a personal app is
  very unlikely to qualify without going through an aggregator that already holds an AISP license
  (see "Aggregator option" below) or obtaining their own license (a materially larger undertaking than
  this build). Available accounts/cards, history depth, refresh limits, and the exact consent flow
  for this user's specific CaixaBank accounts are unverified — they require actually going through
  onboarding, which needs a business decision this session cannot make.
- **imagin:** imagin operates its own third-party linking page
  (https://www.imagin.com/ca/psd2-payment), and imagin is a CaixaBank-group digital brand, but the
  Redsys node list treats "caixabank" and "imagin" as related but not automatically identical
  endpoints for AISP purposes. **Do not assume selecting the CaixaBank node in an aggregator covers
  an imagin-labeled account** — this needs to be verified against the specific institution
  identifier imagin/CaixaBank uses in whichever aggregator's directory is chosen, using this user's
  real (test) credentials during onboarding.

### MyInvestor — banking vs. investment data

- **Evidence level: documented (banking only).** MyInvestor is also listed on the Redsys PSD2 XS2A
  marketplace (https://market.apis-i.redsys.es/psd2/xs2a/nodos/myinvestorbanco), so the same
  AIS-only, same-caveats analysis as CaixaBank applies to MyInvestor's **cash account** data
  (balances, movements).
- **Investment holdings, fund units, cost basis, and investment history are a separate capability
  that the banking PSD2 endpoints do not cover.** MyInvestor's own help center documents PDF
  statements and an Excel cash-movement export for investment accounts
  (https://myinvestor.es/ayuda/preguntas-frecuentes/inversion/), but does not describe those exports
  as a complete transactional/holdings API, and nothing found in this research describes a
  general-purpose MyInvestor *investment* API product distinct from the banking PSD2 surface.
  **Treat MyInvestor's Excel export as a cash-movements file, not a verified complete record of
  investment events (buys, sells, dividends, corporate actions)** — this matches the brief's caution
  and is enforced in the import pipeline (§ below): the generic holdings/activity template is
  offered, but a MyInvestor-specific parser is not claimed to be complete.

### Trade Republic — no verified supported personal-portfolio API

- **Evidence level: documented (statements only), NOT a supported API.** Trade Republic's own
  support center documents a "securities statement" a customer can retrieve
  (https://support.traderepublic.com/fr-fr/845-Where-can-I-find-my-securities-statement) — that is a
  downloadable statement/report feature for end users, not a developer API.
- Search turned up multiple **unofficial, reverse-engineered clients** (e.g. a `trade-republic` PyPI
  package, a `trade-republic-uapi` package, community GitHub repos, and an unofficial MCP server)
  that talk to Trade Republic's private mobile-app backend. These are exactly the category the brief
  prohibits as a default integration ("reverse-engineered mobile APIs... unofficial Trade Republic
  libraries"). **None of these are used in this build.** The `ProviderKind.TRADE_REPUBLIC_UNSUPPORTED`
  enum value exists in the schema purely to make this an explicit, visible, disabled state rather
  than a silent gap — no adapter code targets it, and the app never claims Trade Republic is
  connected.
- **Practical path for Trade Republic today: statement export → CSV/PDF import.** Trade Republic
  lets a user download account and securities statements; those can be fed through the import
  pipeline once the user supplies a representative (redacted, if needed) sample so a parser can be
  written against a *verified* schema rather than invented fixtures, per the brief's explicit
  instruction. No such sample was available in this session, so Trade Republic import currently uses
  the **generic holdings/investment-activity CSV template** (see `docs/financial-methodology.md` and
  the import UI) rather than a claimed institution-specific parser.

### Aggregator option: Powens (evaluated, not adopted)

- **Evidence level: documented.** Powens (https://www.powens.com/products/wealth/) advertises a
  "Wealth & Loans" product covering securities accounts, life insurance, and crypto with automatic
  valuation and transaction sync, claiming 200+ European banks/platforms and calling out a free
  sandbox for developers. This is the most plausible single aggregator to cover both banking (AIS)
  and wealth data for Spain in one contract, and would sidestep needing CaixaBank/MyInvestor AISP
  licensing directly.
- **What's NOT confirmed:** pricing, minimum commitments, whether Powens actually lists CaixaBank,
  imagin, MyInvestor, and Trade Republic specifically among its 200+ connections (their public
  materials don't name every institution), and whether an individual (not a licensed/regulated
  business) can move from sandbox to production without Powens itself acting as the regulated
  intermediary on the user's behalf under a commercial agreement. **This requires a commercial
  decision and a sandbox trial the user has not approved**, so it is not adopted or paid for in this
  build. The adapter interface (`src/server/adapters`) is written so a Powens-backed adapter could
  be added later behind the same `Adapter` interface without touching the domain layer or UI.

## Evidence-level legend used throughout this document and the app's connection UI

| Level | Meaning |
| --- | --- |
| Documented | Public docs/marketing describe the capability; nothing was tested. |
| Sandbox verified | A sandbox environment was actually called and returned expected shapes. |
| Production verified | Real production credentials were used and returned real data. |
| Unknown | No usable public documentation was found. |

Every row above is at most **documented**, several are only partially documented, and none are
sandbox- or production-verified — this session had no credentials for any provider and could not
complete a TPP/AISP onboarding flow (that requires legal-entity registration, eIDAS QWAC/QSEAL
certificates, and in most cases a contractual relationship, none of which are within an
autonomous coding session's authority to obtain). Do not present any of these as connected in the
running application; the app's own Connections screen enforces this by defaulting every real
provider's `ConnectionStatus` to `UNCONFIGURED`.

## What this means for the build

1. Demo mode and CSV/XLSX import are the two adapters that actually work today, and are what the
   shipped app is verified against.
2. The `Adapter` capability interface (accounts/balances/transactions/holdings/activities/prices) is
   implemented so that a CaixaBank-PSD2 adapter and a MyInvestor-PSD2 adapter (AIS/banking data only)
   could be added later, gated behind real onboarding, without changing the domain layer, database
   schema question, or UI.
3. No Trade Republic live adapter exists, by design — only import.
4. Before spending any money or signing any contract (Powens or otherwise), or attempting TPP/AISP
   registration with CaixaBank/MyInvestor/Redsys, that must be an explicit decision by the user; this
   build does not make it and cannot access "production" endpoints on their behalf.

## Sources

- CaixaBank API Store — https://www.caixabank.es/empresa/bancadistancia/api-store_ca.html
- CaixaBank on Redsys PSD2 XS2A — https://market.apis-i.redsys.es/psd2/xs2a/nodos/caixabank
- Redsys PSD2 access guide — https://market.apis-i.redsys.es/psd2/xs2a/guia
- imagin PSD2 linking page — https://www.imagin.com/ca/psd2-payment
- MyInvestor on Redsys PSD2 XS2A — https://market.apis-i.redsys.es/psd2/xs2a/nodos/myinvestorbanco
- MyInvestor investment help / statements — https://myinvestor.es/ayuda/preguntas-frecuentes/inversion/
- Trade Republic securities statement help — https://support.traderepublic.com/fr-fr/845-Where-can-I-find-my-securities-statement
- Powens Wealth & Loans product page — https://www.powens.com/products/wealth/
- Open Banking Tracker — CaixaBank — https://www.openbankingtracker.com/provider/caixabank
- Open Banking Tracker — MyInvestor — https://www.openbankingtracker.com/provider/myinvestor
- Open Banking Tracker — Trade Republic — https://www.openbankingtracker.com/provider/trade-republic
