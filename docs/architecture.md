# Architecture

## Shape

A TypeScript modular monolith on Next.js 16 (App Router, React 19), chosen per the brief's default
for an empty repository. One deployable, one database engine (PostgreSQL), background sync work
run as an explicit job (`src/server/services/sync.ts`) rather than an in-memory timer or a request
that blocks on a bank call.

```
src/
  domain/         pure financial calculation logic — no Prisma, no Next, no I/O. Fully unit tested.
  server/
    adapters/     provider-adapter interface + the Demo adapter + the (empty) live registry
    import/       CSV/XLSX parsing, locale-aware amount/date parsing, preview, commit
    services/     sync orchestration, classification/transfer-matching, read-side reporting
  lib/            cross-cutting: Prisma client, auth config, encryption, display formatting
  components/     shared UI pieces
  app/            routes (moved under src/app/ so the "@/*" path alias covers both)
prisma/
  schema.prisma   the whole data model
  seed/           create-owner.ts (any workspace) and demo-seed.ts (demo workspace + sync)
e2e/              Playwright specs
docs/             this file and its siblings
```

The **domain layer is the one non-negotiable boundary**: every financial number in the UI passes
through `src/domain/*`, which does no I/O and is exhaustively unit tested (56 tests — see
`docs/financial-methodology.md` for what each one proves). `src/server/services/reporting.ts`
queries Prisma, but the moment a number needs a calculation, it hands off to domain code.

## Workspace isolation

The brief requires demo data to never mix with real data. Rather than a `isDemo` flag on shared
rows (one bug away from a leak), this build uses **two separate PostgreSQL databases** —
`DATABASE_URL` (live) and `DATABASE_URL_DEMO` (demo) — selected by the `WORKSPACE_MODE` environment
variable at process start (`src/lib/prisma.ts`). They can even run on different servers. A demo
sync can only ever write to the demo database because the Prisma client the sync code received was
constructed against it.

## Provider adapters

`src/server/adapters/types.ts` defines a capability-based interface
(`accounts | balances | transactions | holdings | activities | prices`), each with an explicit
`{ supported: boolean }` declaration. Calling a fetch method for an unsupported capability throws
`UnsupportedCapabilityError` rather than returning an empty array — see that file's comments for
why this distinction is load-bearing for net-worth math (an absent holding must never be read as a
confirmed zero).

Only `DemoAdapter` is registered (`src/server/adapters/registry.ts`). CaixaBank, imagin, and
MyInvestor have `ProviderKind` enum values and show up in the Connections UI as `UNCONFIGURED`, but
no code implements them — see `docs/integration-feasibility.md` for why. Trade Republic has no
adapter and no enum-backed "not yet configured" placeholder is even attempted to look connectable —
its only path into the app is file import.

## Sync orchestration

`runSync()` (`src/server/services/sync.ts`) pulls from one adapter and writes normalized rows:

- **Idempotent accounts**: upserted on `(institutionId, externalId)`.
- **Idempotent transactions**: upserted on a deterministic `dedupeKey` = sha256(accountId, the
  effective date, signed amount, normalized description). The same logic is used by CSV import
  (`src/server/import/transactions-import.ts`) and by the sync path, so API history and a manual
  import of the same period reconcile without double-counting.
- **Partial failure**: each capability's fetch is wrapped individually; an `UnsupportedCapabilityError`
  or a caught exception marks that capability's contribution as missing and the overall `SyncRun`
  as `PARTIAL`, without discarding what did succeed and without advancing past unread records
  (there's nothing to "advance" until pagination/checkpointing is implemented against a real
  provider — `SyncRun.checkpoint` and `Connection.consentExpiresAt` exist in the schema for when
  that's needed).
- **SourceRecord** rows retain the raw provider/import payload (JSON) separately from the
  normalized `Transaction`, so provenance survives even after a user edits categorization.

## Import pipeline

`parse.ts` (CSV via Papa Parse, XLSX via SheetJS) -> `auto-mapping.ts` (best-effort column
detection by header synonym, Spanish and English) -> `transactions-import.ts` (`previewImport`:
locale-aware parsing, per-row validation, in-file duplicate detection) -> `commit.ts`
(transactional commit, keyed on file sha256 so re-importing the identical file is a no-op).

**Known simplification vs. the brief**: the brief describes an interactive column-mapping wizard
the user adjusts before committing. This build's UI is a single-step form (pick account + file,
submit) that runs auto-detection and preview server-side and shows the *result* (imported /
duplicate / error counts) rather than letting the user edit the mapping before commit. The
underlying `previewImport`/`commitImport` functions support arbitrary mappings and are unit tested
against that interface — wiring a mapping-editing step into the UI is UI work only, not a data-model
or correctness change.

## Auth & authorization

NextAuth 5 with a Credentials provider (email + bcrypt password hash), JWT sessions, no public
registration route. `middleware.ts` requires a session for every route except `/login` and
`/api/auth/*`. `requireOwner()` (`src/lib/auth.ts`) is called at the top of every page/action that
touches data; every Prisma query in this codebase filters by `ownerId` — there is no code path that
fetches another owner's row by object ID alone. The `Session` model exists in the schema for a
future move to database sessions if longer-lived, revocable sessions are wanted.

## Encryption & secrets

`src/lib/crypto.ts` implements AES-256-GCM envelope encryption for `Connection.encryptedAccessToken`
/ `encryptedRefreshToken`, keyed by `APP_ENCRYPTION_KEY` (32 bytes, base64, sourced from the
environment — a real deployment should source this from a KMS/secret manager, not a flat file).
`Connection.tokenCipherVersion` and `APP_ENCRYPTION_KEY_VERSION` exist so a key rotation can decrypt
old rows with the previous key while encrypting new writes with the new one. Nothing in this build
currently populates those token fields (no live adapter authenticates against anything), but the
encryption path itself is implemented and could be exercised today by a script.

`redactForLog()` strips anything token-shaped before any error message is persisted to
`Connection.lastErrorRedacted` or `SyncRun.errorRedacted` — see `docs/operations.md` for the
logging policy this supports.

## Why Next.js 16 specifics matter here

This build targets Next.js 16.3.5, which ships **Cache Components** as an opt-in feature
(`cacheComponents: true` in `next.config.ts`) — this app does **not** enable it, so rendering
follows the pre-16 model (server components fetch data directly; no `"use cache"` / mandatory
`<Suspense>` wrapping required). `app/` was moved under `src/app/` (not the create-next-app
default) purely so the `"@/*"` TypeScript path alias could point at one root (`./src`) covering
both routes and library code; this has no effect on Next's routing.
