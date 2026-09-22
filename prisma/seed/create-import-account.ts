/**
 * One-time setup script: creates an Institution (providerKind IMPORT — no live adapter, exists
 * purely so imported statements have somewhere to attach) plus one Account under it, for the
 * live owner. This is what the import-only path (CaixaBank/imagin/MyInvestor/Trade Republic
 * statement exports, see docs/integration-feasibility.md) needs before the "Target account"
 * dropdown on /connections has anything to select — nothing else in this build creates that row
 * automatically, by design (a real PSD2/aggregator adapter would create it during onboarding
 * instead; import-only institutions have no such onboarding step).
 *
 * Usage:
 *   WORKSPACE_MODE=live npx tsx prisma/seed/create-import-account.ts <ownerEmail> <institutionName> <accountName> [kind] [currency]
 *
 * kind defaults to CASH (one of CASH | CARD | BROKERAGE_CASH | INVESTMENT | LOAN | OTHER).
 * currency defaults to EUR (ISO 4217).
 *
 * Example (CaixaBank current account):
 *   WORKSPACE_MODE=live npx tsx prisma/seed/create-import-account.ts you@example.com CaixaBank "CaixaBank - Cuenta corriente" CASH EUR
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const [ownerEmail, institutionName, accountName, kindArg, currencyArg] = process.argv.slice(2);
  if (!ownerEmail || !institutionName || !accountName) {
    console.error(
      "Usage: npx tsx prisma/seed/create-import-account.ts <ownerEmail> <institutionName> <accountName> [kind] [currency]"
    );
    process.exit(1);
  }
  const kind = (kindArg ?? "CASH").toUpperCase();
  const validKinds = ["CASH", "CARD", "BROKERAGE_CASH", "INVESTMENT", "LOAN", "OTHER"];
  if (!validKinds.includes(kind)) {
    console.error(`Invalid kind "${kind}". Must be one of: ${validKinds.join(", ")}`);
    process.exit(1);
  }
  const currency = (currencyArg ?? "EUR").toUpperCase();

  const mode = (process.env.WORKSPACE_MODE ?? "demo").toLowerCase();
  const url = mode === "live" ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEMO;
  if (!url) {
    console.error(`Missing database URL for WORKSPACE_MODE=${mode}`);
    process.exit(1);
  }
  const db = new PrismaClient({ datasources: { db: { url } } });

  const owner = await db.owner.findUnique({ where: { email: ownerEmail.toLowerCase() } });
  if (!owner) {
    console.error(`No owner found with email ${ownerEmail} in ${mode} workspace.`);
    process.exit(1);
  }

  const institution =
    (await db.institution.findFirst({ where: { ownerId: owner.id, name: institutionName, providerKind: "IMPORT" } })) ??
    (await db.institution.create({
      data: { ownerId: owner.id, name: institutionName, providerKind: "IMPORT", country: "ES" },
    }));

  if (!(await db.connection.findFirst({ where: { institutionId: institution.id } }))) {
    await db.connection.create({
      data: {
        institutionId: institution.id,
        status: "UNCONFIGURED",
        capabilities: { accounts: false, balances: false, transactions: false, holdings: false, activities: false, prices: false },
      },
    });
  }

  const existingAccount = await db.account.findFirst({ where: { ownerId: owner.id, institutionId: institution.id, name: accountName } });
  const account =
    existingAccount ??
    (await db.account.create({
      data: {
        ownerId: owner.id,
        institutionId: institution.id,
        name: accountName,
        kind: kind as never,
        currency,
        includeInNetWorth: true,
        isLiability: false,
      },
    }));

  console.log(`Account ready: "${account.name}" (id ${account.id}) under institution "${institution.name}" (${mode} workspace).`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
