/**
 * One-time setup script: creates the single Owner row for a workspace (demo or live).
 * Usage: WORKSPACE_MODE=live npx tsx prisma/seed/create-owner.ts <email> <password> <displayName>
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

async function main() {
  const [email, password, displayName] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: npx tsx prisma/seed/create-owner.ts <email> <password> [displayName]");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  const mode = (process.env.WORKSPACE_MODE ?? "demo").toLowerCase();
  const url = mode === "live" ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEMO;
  if (!url) {
    console.error(`Missing database URL for WORKSPACE_MODE=${mode}`);
    process.exit(1);
  }
  const db = new PrismaClient({ datasources: { db: { url } } });

  const passwordHash = await bcrypt.hash(password, 12);
  const owner = await db.owner.upsert({
    where: { email: email.toLowerCase() },
    update: { passwordHash, displayName: displayName ?? email, isDemo: mode === "demo" },
    create: {
      email: email.toLowerCase(),
      passwordHash,
      displayName: displayName ?? email,
      isDemo: mode === "demo",
    },
  });

  console.log(`Owner ready in ${mode} workspace: ${owner.email} (id ${owner.id})`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
