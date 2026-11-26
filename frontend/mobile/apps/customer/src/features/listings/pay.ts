import type { Listing } from "./queries";

const PERIOD_SUFFIX: Record<string, string> = {
  MONTHLY: "/mo",
  YEARLY: "/yr",
  ANNUAL: "/yr",
  DAILY: "/day",
  HOURLY: "/hr",
};

const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

/**
 * Pay line for a listing, or `null` when the employer has not published any.
 * The unit comes from the listing's own `salary_period`; it is never assumed.
 */
export function listingPayText(
  listing: Pick<Listing, "salary_min_paise" | "salary_max_paise" | "salary_period" | "salary_display">,
  structuredPay?: unknown,
): string | null {
  if (structuredPay !== undefined && structuredPay !== null && String(structuredPay).trim() !== "") {
    return String(structuredPay).trim();
  }
  const min = listing.salary_min_paise ?? 0;
  const max = listing.salary_max_paise ?? 0;
  if (min > 0) {
    const suffix = PERIOD_SUFFIX[(listing.salary_period ?? "").toUpperCase()] ?? "";
    return max > min ? `${rupees(min)} – ${rupees(max)}${suffix}` : `${rupees(min)}${suffix}`;
  }
  const display = listing.salary_display?.trim();
  return display ? display : null;
}
