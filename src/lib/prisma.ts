import { PrismaClient } from "@prisma/client";

/**
 * Workspace mode selects which database this process talks to.
 * "demo" -> DATABASE_URL_DEMO (synthetic data, isolated from anything real)
 * "live" -> DATABASE_URL (the owner's real data)
 * This keeps demo data structurally incapable of mixing with personal data:
 * they are different Postgres databases, not a flag on shared rows.
 */
export type WorkspaceMode = "demo" | "live";

export function getWorkspaceMode(): WorkspaceMode {
  const mode = process.env.WORKSPACE_MODE?.toLowerCase();
  return mode === "live" ? "live" : "demo";
}

function databaseUrlFor(mode: WorkspaceMode): string {
  const url = mode === "live" ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEMO;
  if (!url) {
    throw new Error(
      `Missing ${mode === "live" ? "DATABASE_URL" : "DATABASE_URL_DEMO"} for WORKSPACE_MODE=${mode}. See .env.example.`
    );
  }
  return url;
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaMode?: WorkspaceMode;
};

function createClient(): PrismaClient {
  const mode = getWorkspaceMode();
  return new PrismaClient({
    datasources: { db: { url: databaseUrlFor(mode) } },
  });
}

// Reuse a single client across hot reloads in dev, but rebuild it if WORKSPACE_MODE changed
// (e.g. a test harness toggling modes between suites).
export const prisma: PrismaClient =
  globalForPrisma.prisma && globalForPrisma.prismaMode === getWorkspaceMode()
    ? globalForPrisma.prisma
    : createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaMode = getWorkspaceMode();
}
