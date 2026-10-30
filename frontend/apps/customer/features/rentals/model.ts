import type { Schemas } from "@vsolve/api-client";

export type RentalAsset = Schemas["RentalAsset"];
export type RentalBooking = Schemas["RentalBooking"];

export interface RentalFilterParams {
  q?: string;
  location?: string;
  service?: string;
  category?: string;
  min_price?: number;
  max_price?: number;
  max_deposit?: number;
  start_date?: string;
  end_date?: string;
  /** A searched point: results within 25 km, nearest first. Both or neither. */
  lat?: number;
  lng?: number;
}

export type RentalMineTab = "ALL" | "UPCOMING" | "ONGOING" | "RETURNED" | "INACTIVE";

/** Each tab as the booking states the server filters on. `ALL` asks for every state. */
export const RENTAL_TAB_STATUSES: Record<RentalMineTab, string> = {
  ALL: "",
  UPCOMING: "AWAITING_TRANSPORT_QUOTE,PENDING_PAYMENT,CONFIRMED",
  ONGOING: "HANDOVER",
  RETURNED: "RETURNED",
  INACTIVE: "CANCELLED,DISPUTED",
};

export function rentalMineBucket(status?: string): Exclude<RentalMineTab, "ALL"> {
  const value = (status ?? "").toUpperCase();
  // Cancelled / disputed leave the Returned bucket (T19).
  if (["CANCELLED", "DISPUTED"].includes(value)) return "INACTIVE";
  if (["RETURNED", "CLOSED"].includes(value)) return "RETURNED";
  if (["HANDOVER", "HANDED_OVER"].includes(value)) return "ONGOING";
  return "UPCOMING";
}

export function formatPaise(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export function calculateRentalDays(start: string, end: string): number {
  if (!start || !end) return 1;
  const s = new Date(start);
  const e = new Date(end);
  const diffTime = e.getTime() - s.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, isNaN(diffDays) ? 1 : diffDays);
}

export function getRentalStatusBadge(status?: string): {
  label: string;
  tone: "success" | "warning" | "neutral" | "brand" | "danger";
} {
  switch ((status ?? "").toUpperCase()) {
    case "AWAITING_TRANSPORT_QUOTE":
      return { label: "Delivery requested", tone: "warning" };
    case "PENDING_PAYMENT":
    case "REQUESTED":
      return { label: "Requested / Pending", tone: "warning" };
    case "CONFIRMED":
      return { label: "Booking Confirmed", tone: "brand" };
    case "HANDOVER":
    case "HANDED_OVER":
      return { label: "In Your Possession", tone: "success" };
    case "RETURNED":
      return { label: "Returned & Inspected", tone: "neutral" };
    case "CLOSED":
      return { label: "Completed", tone: "neutral" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "danger" };
    case "DISPUTED":
      return { label: "Disputed", tone: "danger" };
    default:
      return { label: status ?? "Pending", tone: "neutral" };
  }
}

export function getDepositStatusBadge(status?: string): {
  label: string;
  tone: "success" | "warning" | "neutral" | "danger";
} {
  switch ((status ?? "").toUpperCase()) {
    case "HELD":
      return { label: "Deposit Held (Protected)", tone: "warning" };
    case "RELEASED":
      return { label: "Deposit Refunded", tone: "success" };
    case "DEDUCTED":
    case "FORFEITED":
      return { label: "Deposit Deducted", tone: "danger" };
    default:
      return { label: status ? `Deposit ${status}` : "Deposit Pending", tone: "neutral" };
  }
}
