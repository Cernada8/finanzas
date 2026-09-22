"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sha256Hex } from "@/lib/crypto";
import { parseFile } from "@/server/import/parse";
import { autoDetectMapping } from "@/server/import/auto-mapping";
import { previewImport } from "@/server/import/transactions-import";
import { commitImport } from "@/server/import/commit";
import { runSync } from "@/server/services/sync";
import { applyRulesForOwner, matchTransfersForOwner } from "@/server/services/classification";
import { getAdapter, isLiveAdapterAvailable } from "@/server/adapters/registry";

export interface ImportOutcome {
  ok: boolean;
  message: string;
}

export async function importTransactionsFile(_prevState: ImportOutcome | null, formData: FormData): Promise<ImportOutcome> {
  const owner = await requireOwner();

  const file = formData.get("file");
  const accountId = formData.get("accountId");
  if (!(file instanceof File) || typeof accountId !== "string" || !accountId) {
    return { ok: false, message: "Select a file and an account." };
  }

  // Authorization: the target account must belong to this owner.
  const account = await prisma.account.findFirst({ where: { id: accountId, ownerId: owner.id } });
  if (!account) {
    return { ok: false, message: "Account not found." };
  }

  const MAX_BYTES = 15 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return { ok: false, message: "File too large (max 15 MB)." };
  }
  const fileName = file.name;
  const fileType = fileName.toLowerCase().endsWith(".xlsx") ? "XLSX" : "CSV";

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileHash = sha256Hex(buffer);

  let table;
  try {
    table = parseFile(fileType, buffer);
  } catch (e) {
    return { ok: false, message: `Could not parse file: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (table.headers.length === 0) {
    return { ok: false, message: "File has no header row / no columns detected." };
  }

  const { mapping, confident } = autoDetectMapping(table.headers);
  const preview = previewImport(table, mapping, "es-ES", account.id);

  if (preview.validCount === 0) {
    return {
      ok: false,
      message: `No valid rows detected${confident ? "" : " (could not confidently auto-detect columns — this generic importer expects date, amount, description columns)"}.`,
    };
  }

  const outcome = await commitImport(prisma, {
    ownerId: owner.id,
    accountId: account.id,
    fileName,
    fileType,
    fileHash,
    columnMapping: mapping as unknown as Record<string, unknown>,
    locale: "es-ES",
    preview,
  });

  if (!outcome.alreadyImported) {
    await applyRulesForOwner(prisma, owner.id);
    await matchTransfersForOwner(prisma, owner.id);
  }

  revalidatePath("/activity");
  revalidatePath("/spending");
  revalidatePath("/");

  if (outcome.alreadyImported) {
    return { ok: true, message: `This exact file was already imported (batch ${outcome.importBatchId}) — no changes made.` };
  }
  return {
    ok: true,
    message: `Imported ${outcome.rowsImported} row(s), skipped ${outcome.rowsDuplicate} duplicate(s), ${outcome.rowsErrored} error(s).${
      confident ? "" : " Columns were auto-detected with low confidence — please verify results on the Spending page."
    }`,
  };
}

export async function runDemoSync(): Promise<void> {
  const owner = await requireOwner();
  if (!owner.isDemo) return; // demo sync only ever runs against the demo workspace

  const connection = await prisma.connection.findFirst({
    where: { institution: { ownerId: owner.id, providerKind: "DEMO" } },
    include: { institution: true },
  });
  if (!connection) return;

  if (isLiveAdapterAvailable("DEMO")) {
    const adapter = getAdapter("DEMO");
    await runSync(prisma, owner.id, connection.id, connection.institutionId, adapter, "MANUAL");
    await applyRulesForOwner(prisma, owner.id);
    await matchTransfersForOwner(prisma, owner.id);
  }

  revalidatePath("/connections");
  revalidatePath("/");
  revalidatePath("/spending");
  revalidatePath("/investments");
}
