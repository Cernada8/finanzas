/**
 * Application-layer envelope encryption for provider tokens at rest (brief §7).
 *
 * APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key, sourced from a managed secret store /
 * KMS in production (documented in .env.example and docs/operations.md), never committed. This
 * module never logs plaintext, and callers must not log the return value of `decrypt`.
 *
 * Key rotation: `APP_ENCRYPTION_KEY_VERSION` is stored alongside each ciphertext
 * (Connection.tokenCipherVersion). To rotate, add support for decrypting the old version while
 * encrypting new writes with the new one, then re-encrypt existing rows in a migration job.
 */
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";

function loadKey(): Buffer {
  const b64 = process.env.APP_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error("APP_ENCRYPTION_KEY is not set. See .env.example.");
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).");
  }
  return key;
}

export interface EncryptedPayload {
  ciphertext: string; // base64
  keyVersion: number;
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const key = loadKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Layout: iv (12) || authTag (16) || ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return {
    ciphertext: packed.toString("base64"),
    keyVersion: Number(process.env.APP_ENCRYPTION_KEY_VERSION ?? 1),
  };
}

export function decryptSecret(ciphertextB64: string): string {
  const key = loadKey();
  const packed = Buffer.from(ciphertextB64, "base64");
  const iv = packed.subarray(0, 12);
  const authTag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

/** SHA-256 hash for file dedup / provenance — not for secrets. */
export function sha256Hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** Deterministic dedupe key for a transaction, used as a unique index to make imports idempotent. */
export function transactionDedupeKey(parts: {
  accountId: string;
  dateIso: string;
  amountMinor: bigint;
  normalizedDescription: string;
}): string {
  return sha256Hex(`${parts.accountId}|${parts.dateIso}|${parts.amountMinor}|${parts.normalizedDescription}`);
}

/** Redact anything that looks like it could be a secret/token before logging. */
export function redactForLog(message: string): string {
  return message
    .replace(/[A-Za-z0-9-_]{24,}/g, "[REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}
