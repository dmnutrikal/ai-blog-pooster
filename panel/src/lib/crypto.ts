// AES-256-GCM for secrets at rest (Client secrets in the stores table).
// Key: CREDENTIALS_KEY (32 bytes, base64; `npm run gen-key`). The blog pipeline decrypts with the
// same key from its CREDENTIALS_KEY GitHub secret (src/lib/storeRecord.js), so the two must match.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

let cachedKey: Buffer | undefined;

export function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const b64 = process.env.CREDENTIALS_KEY?.trim();
  if (!b64) throw new Error("CREDENTIALS_KEY is not set. Generate one with `npm run gen-key`; use the same value as the CREDENTIALS_KEY GitHub secret.");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("CREDENTIALS_KEY must be 32 bytes, base64-encoded");
  cachedKey = key;
  return key;
}

// Format: v1.<iv>.<tag>.<ciphertext>, each part base64url.
export function encrypt(plaintext: string, key: Buffer = encryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decrypt(payload: string, key: Buffer = encryptionKey()): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || data === undefined) throw new Error("Unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
