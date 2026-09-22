/**
 * Seeds the DEMO workspace: creates the demo Owner (if missing), institutions/connections for
 * every institution named in the brief (all UNCONFIGURED except the Demo adapter), categories,
 * starter rules and a budget, then runs a sync against the DemoAdapter so the app has realistic
 * data to show immediately. Safe to re-run (idempotent upserts + idempotent sync).
 *
 * Usage: npx tsx prisma/seed/demo-seed.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DemoAdapter } from "@/server/adapters/demo-adapter";
import { runSync } from "@/server/services/sync";
import { applyRulesForOwner, matchTransfersForOwner } from "@/server/services/classification";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password-please-change";

async function main() {
  const url = process.env.DATABASE_URL_DEMO;
  if (!url) throw new Error("DATABASE_URL_DEMO is not set");
  const db = new PrismaClient({ datasources: { db: { url } } });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const owner = await db.owner.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      displayName: "Demo Owner",
      isDemo: true,
      locale: "es-ES",
      language: "en",
      reportingCcy: "EUR",
      timezone: "Europe/Madrid",
    },
  });

  // Institutions named in the brief — real ones start UNCONFIGURED (no live adapter, honest state);
  // only the Demo Bank institution is actually connected.
  const demoInstitution =
    (await db.institution.findFirst({ where: { ownerId: owner.id, providerKind: "DEMO" } })) ??
    (await db.institution.create({ data: { ownerId: owner.id, name: "Demo Bank", providerKind: "DEMO", country: "ES" } }));

  const demoConnection =
    (await db.connection.findFirst({ where: { institutionId: demoInstitution.id } })) ??
    (await db.connection.create({
      data: {
        institutionId: demoInstitution.id,
        status: "UNCONFIGURED",
        capabilities: {
          accounts: true,
          balances: true,
          transactions: true,
          holdings: true,
          activities: true,
          prices: true,
        },
      },
    }));

  const realInstitutions: Array<{ name: string; kind: "CAIXABANK_PSD2" | "IMAGIN_PSD2" | "MYINVESTOR_PSD2" }> = [
    { name: "CaixaBank", kind: "CAIXABANK_PSD2" },
    { name: "imagin", kind: "IMAGIN_PSD2" },
    { name: "MyInvestor", kind: "MYINVESTOR_PSD2" },
  ];
  for (const inst of realInstitutions) {
    const institution =
      (await db.institution.findFirst({ where: { ownerId: owner.id, providerKind: inst.kind } })) ??
      (await db.institution.create({ data: { ownerId: owner.id, name: inst.name, providerKind: inst.kind, country: "ES" } }));
    const existingConn = await db.connection.findFirst({ where: { institutionId: institution.id } });
    if (!existingConn) {
      await db.connection.create({
        data: {
          institutionId: institution.id,
          status: "UNCONFIGURED",
          capabilities: { accounts: false, balances: false, transactions: false, holdings: false, activities: false, prices: false },
        },
      });
    }
  }
  // Trade Republic: institution row exists for visibility in the Connections UI, but with
  // TRADE_REPUBLIC_UNSUPPORTED and no adapter ever targeting it — see docs/integration-feasibility.md.
  const tradeRepublic =
    (await db.institution.findFirst({ where: { ownerId: owner.id, providerKind: "TRADE_REPUBLIC_UNSUPPORTED" } })) ??
    (await db.institution.create({
      data: { ownerId: owner.id, name: "Trade Republic", providerKind: "TRADE_REPUBLIC_UNSUPPORTED", country: "DE" },
    }));
  if (!(await db.connection.findFirst({ where: { institutionId: tradeRepublic.id } }))) {
    await db.connection.create({
      data: {
        institutionId: tradeRepublic.id,
        status: "UNCONFIGURED",
        capabilities: { accounts: false, balances: false, transactions: false, holdings: false, activities: false, prices: false },
      },
    });
  }

  // Categories
  const categoryNames: Array<{ name: string; kind: string }> = [
    { name: "Groceries", kind: "expense" },
    { name: "Rent", kind: "expense" },
    { name: "Dining out", kind: "expense" },
    { name: "Fitness", kind: "expense" },
    { name: "Shopping", kind: "expense" },
    { name: "Cash withdrawal", kind: "expense" },
    { name: "Salary", kind: "income" },
    { name: "Investment purchase", kind: "investment" },
    { name: "Investment income", kind: "investment" },
    { name: "Internal transfer", kind: "transfer" },
  ];
  const categories = new Map<string, string>();
  for (const c of categoryNames) {
    const cat = await db.category.upsert({
      where: { ownerId_name: { ownerId: owner.id, name: c.name } },
      update: {},
      create: { ownerId: owner.id, name: c.name, kind: c.kind },
    });
    categories.set(c.name, cat.id);
  }

  // Starter rules (deterministic, explainable)
  const ruleDefs: Array<{ name: string; priority: number; matchDescriptionContains?: string; setCategoryId: string; setEconomicClass: string }> = [
    { name: "Mercadona -> Groceries", priority: 10, matchDescriptionContains: "MERCADONA", setCategoryId: categories.get("Groceries")!, setEconomicClass: "EXPENSE" },
    { name: "Alquiler -> Rent", priority: 10, matchDescriptionContains: "ALQUILER", setCategoryId: categories.get("Rent")!, setEconomicClass: "EXPENSE" },
    { name: "Restaurante -> Dining", priority: 20, matchDescriptionContains: "RESTAURANTE", setCategoryId: categories.get("Dining out")!, setEconomicClass: "EXPENSE" },
    { name: "Gimnasio -> Fitness", priority: 20, matchDescriptionContains: "GIMNASIO", setCategoryId: categories.get("Fitness")!, setEconomicClass: "EXPENSE" },
    { name: "Nomina -> Salary income", priority: 5, matchDescriptionContains: "NOMINA", setCategoryId: categories.get("Salary")!, setEconomicClass: "INCOME" },
    { name: "Reintegro cajero -> Cash withdrawal", priority: 30, matchDescriptionContains: "REINTEGRO", setCategoryId: categories.get("Cash withdrawal")!, setEconomicClass: "EXPENSE" },
    { name: "Devolucion -> Refund", priority: 15, matchDescriptionContains: "DEVOLUCION", setCategoryId: categories.get("Shopping")!, setEconomicClass: "REFUND" },
    { name: "El Corte Ingles -> Shopping", priority: 25, matchDescriptionContains: "EL CORTE INGLES", setCategoryId: categories.get("Shopping")!, setEconomicClass: "EXPENSE" },
  ];
  for (const r of ruleDefs) {
    const existing = await db.rule.findFirst({ where: { ownerId: owner.id, name: r.name } });
    if (!existing) {
      await db.rule.create({
        data: {
          ownerId: owner.id,
          name: r.name,
          priority: r.priority,
          matchDescriptionContains: r.matchDescriptionContains,
          setCategoryId: r.setCategoryId,
          setEconomicClass: r.setEconomicClass as never,
        },
      });
    }
  }

  // Budget
  const groceriesCategoryId = categories.get("Groceries")!;
  const existingBudget = await db.budget.findFirst({ where: { ownerId: owner.id, categoryId: groceriesCategoryId } });
  if (!existingBudget) {
    await db.budget.create({
      data: {
        ownerId: owner.id,
        categoryId: groceriesCategoryId,
        name: "Groceries budget",
        monthlyLimitMinor: 40000n,
        currency: "EUR",
        startMonth: "2026-01",
      },
    });
  }

  // Run the demo sync
  const adapter = new DemoAdapter();
  const outcome = await runSync(db, owner.id, demoConnection.id, demoInstitution.id, adapter, "MANUAL");
  console.log("Demo sync outcome:", outcome);

  const rulesApplied = await applyRulesForOwner(db, owner.id);
  const transfersMatched = await matchTransfersForOwner(db, owner.id);
  console.log(`Applied classification to ${rulesApplied} transactions; matched ${transfersMatched} transfer candidates.`);

  console.log(`\nDemo workspace ready. Sign in with:\n  email: ${DEMO_EMAIL}\n  password: ${DEMO_PASSWORD}\n`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
