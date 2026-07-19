// ─────────────────────────────────────────────────────────────────────────────
// Server-side pricing.
//
// The client renders a live estimate as the customer taps requirements, but the
// number that reaches the database is ALWAYS recomputed here from the raw
// selections and the current config. A client-supplied total is never read —
// otherwise a crafted request could book a ₹2,000 deep clean for ₹1.
// ─────────────────────────────────────────────────────────────────────────────

import { getServiceConfig } from "./service-config";
import { estimatePrice, type PriceEstimate, type Selections } from "./pricing";

export type PriceBookingInput = {
  categorySlug: string;
  subCategorySlug?: string | null;
  serviceSlug?: string | null;
  selections: Selections;
};

export function priceBooking(input: PriceBookingInput): PriceEstimate {
  const config = getServiceConfig(
    input.categorySlug,
    input.subCategorySlug ?? undefined,
    input.serviceSlug ?? undefined,
  );
  return estimatePrice(config.detailFields, input.selections ?? {});
}

/**
 * Narrow arbitrary JSON into Selections. Request bodies arrive as `unknown`, and
 * estimatePrice ignores anything it does not recognise, so this only has to
 * strip values of the wrong shape rather than validate against the config.
 */
export function coerceSelections(raw: unknown): Selections {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Selections = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number") {
      out[key] = value;
    } else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      out[key] = value as string[];
    }
  }
  return out;
}
