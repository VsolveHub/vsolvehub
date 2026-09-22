import type { Schemas } from "@vsolve/api-client";

export type StayProperty = Schemas["Property"];
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
}

export function formatPaise(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
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
      return { label: "Enquiry Sent · Awaiting Host", tone: "brand" };
    case "RESPONDED":
      return { label: "Host Responded", tone: "success" };
    case "DECLINED":
      return { label: "Declined by Host", tone: "danger" };
    case "WITHDRAWN":
      return { label: "Withdrawn", tone: "neutral" };
    case "EXPIRED":
      return { label: "Expired", tone: "neutral" };
    default:
      return { label: status ?? "Submitted", tone: "neutral" };
  }
}
