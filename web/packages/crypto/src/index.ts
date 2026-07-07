import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

// AES-256-GCM application-layer encryption for PII at rest (Aadhaar, bank acct).
// Encryption happens in app code (not Postgres pgcrypto) so the key lives in the
// app env, never in the database, and stays portable across DB/backends.
// KEY must be 32 bytes. Provide a 64-char hex string in PARTNER_PII_KEY.

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.PARTNER_PII_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "PARTNER_PII_KEY must be a 64-char hex string (32 bytes). Generate with: openssl rand -hex 32",
    );
  }
  return Buffer.from(hex, "hex");
}

/** Returns a compact `iv:tag:ciphertext` base64 bundle, safe to store as TEXT. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(bundle: string): string {
  const [ivB64, tagB64, dataB64] = bundle.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed ciphertext bundle");
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** SHA-256 hash for OTP codes — never store the raw OTP. */
export function hashOtp(code: string, phone: string): string {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

export function last4(value: string): string {
  return value.replace(/\s/g, "").slice(-4);
}
