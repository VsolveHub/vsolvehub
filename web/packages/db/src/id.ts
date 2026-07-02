import { randomBytes } from "node:crypto";

// Crockford base32 — uppercase, omits I/L/O/U to avoid visual ambiguity when a
// human reads an ID off a screen or support ticket.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function token(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! & 31];
  return out;
}

/**
 * Branded, collision-resistant identifier for VSolveHub entities.
 * Format: `<PREFIX>-<base32>` (e.g. `vsId("VSP")` → `"VSP-7K2M9QX4TB1F"`).
 * 12 base32 chars ≈ 1.2e18 combinations — safe to use as a primary key.
 *
 * Prefix scheme: VSP = partner · VSC = crew · VSB = booking · VSU = customer.
 * (Only Partner uses this today; the rest still use cuid.)
 */
export function vsId(prefix: string, length = 12): string {
  return `${prefix}-${token(length)}`;
}

/** Partner primary key, e.g. `"VSP-7K2M9QX4TB1F"`. */
export function partnerId(): string {
  return vsId("VSP");
}
