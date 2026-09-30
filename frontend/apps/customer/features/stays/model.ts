import type { Schemas } from "@vsolve/api-client";

export type StayProperty = Schemas["Property"];
export type StayPropertySummary = Schemas["PropertySummary"];
export type StayUnit = Schemas["Unit"];
export type StayEnquiry = Schemas["StayEnquiry"];
export type StayQuote = Schemas["StayQuoteResponse"];

export function stayFields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface StayFilterParams {
  q?: string;
  location?: string;
  sharing_count?: number;
  ac?: boolean;
  food?: boolean;
  min_price?: number;
  max_price?: number;
  service?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export function formatPaise(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

/** What a stay's rate is quoted per. Stays are never paid online; this is for display. */
export type PricePeriod = "NIGHT" | "MONTH";

export function pricePeriodOf(value: string | undefined | null): PricePeriod {
  return value === "NIGHT" ? "NIGHT" : "MONTH";
}

/** "₹9,000 / month" or "₹2,500 / night". */
export function formatRate(paise: number, period: PricePeriod): string {
  return `${formatPaise(paise)} / ${period === "NIGHT" ? "night" : "month"}`;
}

/**
 * What a guest needs to know about who is in a room, by how the stay type lets its rooms:
 * a hotel room is taken whole ("Up to 3 guests"); a PG room is let by the bed
 * ("2 sharing", or "Private room" when nobody shares it).
 */
export function roomOccupancyLabel(
  unit: { sharing_count?: number; max_guests?: number },
  roomStyle: string | undefined | null,
): string {
  if (roomStyle === "PRIVATE") {
    const guests = unit.max_guests ?? 1;
    return `Up to ${guests} guest${guests === 1 ? "" : "s"}`;
  }
  const sharing = unit.sharing_count ?? 1;
  return sharing === 1 ? "Private room" : `${sharing} sharing`;
}

/** "3 months", "1 night". */
export function stayLengthLabel(length: number, period: PricePeriod): string {
  const unit = period === "NIGHT" ? "night" : "month";
  return `${length} ${unit}${length === 1 ? "" : "s"}`;
}

export function calculateNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 1;
  const s = new Date(checkIn);
  const e = new Date(checkOut);
  const diffTime = e.getTime() - s.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, isNaN(diffDays) ? 1 : diffDays);
}

export function getEnquiryStatusBadge(status?: string): {
  label: string;
  tone: "success" | "warning" | "neutral" | "brand" | "danger";
} {
  switch ((status ?? "").toUpperCase()) {
    case "SUBMITTED":
      return { label: "Sent · The host will call you", tone: "brand" };
    case "RESPONDED":
      return { label: "Host Responded", tone: "success" };
    case "DECLINED":
      return { label: "Not available", tone: "danger" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "danger" };
    case "CONFIRMED":
      return { label: "Booked", tone: "success" };
    case "WITHDRAWN":
      return { label: "Withdrawn", tone: "neutral" };
    case "EXPIRED":
      return { label: "Expired", tone: "neutral" };
    default:
      return { label: status ?? "Submitted", tone: "neutral" };
  }
}
