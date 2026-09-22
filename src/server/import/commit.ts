/**
 * Transactional commit of a validated import preview into the database.
 * Idempotent: re-importing the identical file (same sha256 hash, same owner) is a no-op that
 * reports the existing batch rather than creating duplicate transactions; within a batch,
 * duplicate detection uses the same dedupeKey the live-sync path uses, so overlapping
 * API history and re-imports reconcile without double counting.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import type { PreviewResult } from "./transactions-import";

export interface CommitImportInput {
  ownerId: string;
  accountId: string;
  fileName: string;
  fileType: "CSV" | "XLSX";
  fileHash: string;
  columnMapping: Record<string, unknown>;
  locale: string;
  preview: PreviewResult;
}

export interface CommitImportOutcome {
  importBatchId: string;
  rowsImported: number;
  rowsDuplicate: number;
  rowsErrored: number;
  alreadyImported: boolean;
}

export async function commitImport(db: PrismaClient, input: CommitImportInput): Promise<CommitImportOutcome> {
  const existing = await db.importBatch.findUnique({
    where: { ownerId_fileHash: { ownerId: input.ownerId, fileHash: input.fileHash } },
  });
  if (existing && existing.status === "COMMITTED") {
    return {
      importBatchId: existing.id,
      rowsImported: existing.rowsImported,
      rowsDuplicate: existing.rowsDuplicate,
      rowsErrored: existing.rowsErrored,
      alreadyImported: true,
    };
  }

  const validRows = input.preview.rows.filter((r) => r.ok && !r.isDuplicateInFile);
  const errorRows = input.preview.rows.filter((r) => !r.ok);

  const result = await db.$transaction(async (tx) => {
    const batch = await tx.importBatch.upsert({
      where: { ownerId_fileHash: { ownerId: input.ownerId, fileHash: input.fileHash } },
      update: {
        status: "COMMITTED",
        committedAt: new Date(),
        rowsTotal: input.preview.rows.length,
      },
      create: {
        ownerId: input.ownerId,
        fileName: input.fileName,
        fileType: input.fileType,
        fileHash: input.fileHash,
        targetAccountId: input.accountId,
        columnMapping: input.columnMapping as Prisma.InputJsonValue,
        locale: input.locale,
        status: "COMMITTED",
        rowsTotal: input.preview.rows.length,
        committedAt: new Date(),
      },
    });

    let imported = 0;
    let duplicateAgainstDb = 0;

    for (const row of validRows) {
      const sourceRecord = await tx.sourceRecord.create({
        data: {
          origin: "import",
          importBatchId: batch.id,
          rawPayload: {
            description: row.description,
            merchant: row.merchant ?? null,
            isoDate: row.isoDate,
            bookedIsoDate: row.bookedIsoDate,
            amountMinor: row.amountMinor!.toString(),
          },
        },
      });

      const createdOrExisting = await tx.transaction.findUnique({ where: { dedupeKey: row.dedupeKey! } });
      if (createdOrExisting) {
        duplicateAgainstDb += 1;
        continue;
      }

      await tx.transaction.create({
        data: {
          ownerId: input.ownerId,
          accountId: input.accountId,
          sourceRecordId: sourceRecord.id,
          transactionDate: new Date(row.isoDate!),
          bookedDate: row.bookedIsoDate ? new Date(row.bookedIsoDate) : null,
          status: "BOOKED",
          amountMinor: row.amountMinor!,
          currency: "EUR",
          description: row.description!,
          rawDescription: row.description!,
          merchant: row.merchant,
          dedupeKey: row.dedupeKey!,
          economicClass: "UNRESOLVED",
          classificationSource: "provider",
        },
      });
      imported += 1;
    }

    const rowsDuplicate = input.preview.duplicateInFileCount + duplicateAgainstDb;
    await tx.importBatch.update({
      where: { id: batch.id },
      data: { rowsImported: imported, rowsDuplicate, rowsErrored: errorRows.length, errors: errorRows as unknown as Prisma.InputJsonValue },
    });

    return { importBatchId: batch.id, rowsImported: imported, rowsDuplicate, rowsErrored: errorRows.length };
  });

  return { ...result, alreadyImported: false };
}
