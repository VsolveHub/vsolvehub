/**
 * An offline GSTIN check, the same rules as `backend/apps/partners/gstin.py`.
 *
 * It says the number is well formed, not that it is Active on the GST portal: Operations checks
 * that by hand. The server checks again on save and is the one that decides; this only lets the
 * form say what is wrong before the employer presses Continue.
 */

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Two-digit state codes a GSTIN may start with. */
const STATE_CODES: ReadonlySet<string> = new Set([
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "26", "27", "29", "30", "31", "32",
  "33", "34", "35", "36", "37", "38", "97", "99",
]);

const SHAPE = /^[A-Z0-9]{15}$/;
const PAN_PART = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export type GstinProblem = "format" | "state" | "pan" | "checksum";

export type GstinCheck = { ok: true; gstin: string } | { ok: false; problem: GstinProblem };

/** The check character for the first 14 characters. */
export function gstinCheckChar(first14: string): string {
  let total = 0;
  for (let index = 0; index < first14.length; index += 1) {
    const value = CHARSET.indexOf(first14[index] ?? "") * (index % 2 === 0 ? 1 : 2);
    total += Math.floor(value / 36) + (value % 36);
  }
  return CHARSET[(36 - (total % 36)) % 36] ?? "";
}

/** Spaces and case do not matter; the result is the normalised number. */
export function checkGstin(raw: string): GstinCheck {
  const gstin = raw.replace(/\s+/g, "").toUpperCase();
  if (!SHAPE.test(gstin)) return { ok: false, problem: "format" };
  if (!STATE_CODES.has(gstin.slice(0, 2))) return { ok: false, problem: "state" };
  if (!PAN_PART.test(gstin.slice(2, 12))) return { ok: false, problem: "pan" };
  if (gstin[12] === "0") return { ok: false, problem: "format" };
  if (gstin[14] !== gstinCheckChar(gstin.slice(0, 14))) return { ok: false, problem: "checksum" };
  return { ok: true, gstin };
}
