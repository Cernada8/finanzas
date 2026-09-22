# Spending & Investment Dashboard

A private, single-owner personal finance web app: spending, budgets, and investment tracking
across imagin/CaixaBank, Trade Republic, and MyInvestor. See `docs/integration-feasibility.md`
for what's actually connected today (short version: nothing live — demo data and file import),
`docs/architecture.md` for how it's built, `docs/financial-methodology.md` for exactly how every
number is calculated, and `docs/operations.md` for running, backing up, and deleting data.

## Stack

Next.js 16 (App Router) + React 19, PostgreSQL 16 via Prisma 6, NextAuth 5 (credentials, single
owner, no public signup), decimal.js for all money/unit/price/FX math, Tailwind CSS 4, Recharts.
Tests: Vitest (domain/unit) + Playwright (e2e).

## Quick start (local)

Requires Node 22+, PostgreSQL 16+, and two databases (one for the demo workspace, one for your
real data — see below for why).

```bash
npm install
cp .env.example .env.local        # fill in secrets — see comments in the file
createdb spending_dashboard
createdb spending_dashboard_demo
npx prisma migrate deploy          # against DATABASE_URL
DATABASE_URL="$DATABASE_URL_DEMO" npx prisma migrate deploy   # against the demo DB too

# Seed and try the demo workspace first (safe — fully synthetic, isolated database):
npx tsx prisma/seed/demo-seed.ts
WORKSPACE_MODE=demo npm run dev
# -> http://localhost:3000/login
#    demo@example.com / demo-password-please-change

# When ready to use your own data:
WORKSPACE_MODE=live npx tsx prisma/seed/create-owner.ts you@example.com "a strong password" "Your Name"
WORKSPACE_MODE=live npm run dev
```

`WORKSPACE_MODE` picks the database (`demo` -> `DATABASE_URL_DEMO`, `live` -> `DATABASE_URL`) —
see `docs/architecture.md#workspace-isolation` for why this, and not a flag on shared rows, is how
demo and real data stay separated.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (also runs the TypeScript check) |
| `npm run start` | Run a production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest — the financial domain test suite (56 tests) |
| `npm run test:e2e` | Playwright — sign-in, drilldown, import, and connections coverage (requires a running server on `WORKSPACE_MODE=demo`, seeded) |

## What's real vs. demo vs. unverified

This matters enough that it's answered in three places, not one: the running app's **Connections**
page shows live status per institution; `docs/integration-feasibility.md` explains the research
behind each status; and the final delivery report (given to the user alongside this repo) states
plainly what was tested and how.

In short: demo mode and CSV/XLSX import are real and tested. CaixaBank, imagin, and MyInvestor have
no live adapter — only documented feasibility — and show as `UNCONFIGURED`. Trade Republic has no
adapter at all, by design (see integration-feasibility.md). No institution is ever shown as
connected unless it actually is.
