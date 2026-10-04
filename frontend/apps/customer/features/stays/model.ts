import type { Schemas } from "@vsolve/api-client";

export type StayProperty = Schemas["Property"];
export type StayPropertySummary = Schemas["PropertySummary"];
export type StayUnit = Schemas["Unit"];
export type StayEnquiry = Schemas["StayEnquiry"];
export type StayQuote = Schemas["StayQuoteResponse"];

export interface StayFilterParams {
  q?: string;
  location?: string;
  sharing_count?: number;
  ac?: boolean;
  food?: boolean;
  min_price?: number;
  max_price?: number;
  tenant_preference?: string;
  service?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

/** The server refuses larger photos; checking first spares a slow upload that would fail. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_TOO_LARGE = "Each photo must be 10 MB or smaller.";
export const MAX_REVIEW_PHOTOS = 5;

/** A review's photo links, which the API types loosely (a JSON list). */
export function reviewPhotoUrls(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((url): url is string => typeof url === "string") : [];
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

/** "2 rooms available" / "1 bed available" — what a guest reads under a room type. */
export function availabilityLabel(count: number | undefined, roomStyle?: string | null): string {
  const n = Math.max(count ?? 0, 0);
  const word = roomStyle === "SHARED" ? "bed" : "room";
  return `${n} ${word}${n === 1 ? "" : "s"} available`;
}

/** "17:00:00" → "5 PM", "10:30:00" → "10:30 AM". */
export function formatVisitTime(value: string | undefined | null): string {
  if (!value) return "";
  const [h = "0", m = "0"] = value.split(":");
  const hour = Number(h);
  const minute = Number(m);
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 || 12;
  return minute ? `${display}:${String(minute).padStart(2, "0")} ${suffix}` : `${display} ${suffix}`;
}

export function visitWindowLabel(start?: string | null, end?: string | null): string {
  return `${formatVisitTime(start)} – ${formatVisitTime(end)}`;
}

/** "2026-10-12" → "Sat, 12 Oct". Read as a local calendar day, never shifted by time zone. */
export function visitDayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!, 12);
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function getVisitStatusBadge(status?: string): {
  label: string;
  tone: "success" | "neutral" | "info" | "danger";
} {
  switch (status) {
    case "REQUESTED":
      return { label: "Waiting for the owner", tone: "info" };
    case "ACCEPTED":
      return { label: "🟢 Visit accepted", tone: "success" };
    case "DECLINED":
      return { label: "🔴 Schedule not accepted", tone: "danger" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "neutral" };
    case "EXPIRED":
      return { label: "Expired", tone: "neutral" };
    default:
      return { label: status ?? "Requested", tone: "neutral" };
  }
}

/** Shown wherever money comes up: stays are paid to the owner, never to V Solve Hub. */
export const DIRECT_PAYMENT_NOTE =
  "Payment is made directly to the property owner. V Solve Hub does not collect the room rent.";

/** "+919955550001" → "+91 99555 50001"; anything else is shown as given. */
export function formatPhone(value: string | undefined | null): string {
  const raw = (value ?? "").trim();
  const match = /^\+91(\d{5})(\d{5})$/.exec(raw);
  return match ? `+91 ${match[1]} ${match[2]}` : raw;
}
