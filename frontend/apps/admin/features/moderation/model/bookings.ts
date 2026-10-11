/**
 * Plain-language rules for the rental and stay booking lists. Kept free of React so they can be
 * unit tested and so the two lists say the same thing the same way.
 */

export const RENTAL_STATUS_LABEL: Record<string, string> = {
  AWAITING_TRANSPORT_QUOTE: "Waiting for delivery price",
  PENDING_PAYMENT: "Waiting for payment",
  CONFIRMED: "Paid, not yet handed over",
  HANDOVER: "With the customer",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
  DISPUTED: "Deposit disputed",
};

export const RENTAL_STATUS_TONE: Record<string, "warning" | "info" | "success" | "neutral" | "danger"> = {
  AWAITING_TRANSPORT_QUOTE: "warning",
  PENDING_PAYMENT: "warning",
  CONFIRMED: "info",
  HANDOVER: "info",
  RETURNED: "success",
  CANCELLED: "neutral",
  DISPUTED: "danger",
};

/** The server refuses a cancel once the equipment has left the owner. Mirror it, never widen it. */
const RENTAL_CANCELLABLE = new Set(["AWAITING_TRANSPORT_QUOTE", "PENDING_PAYMENT", "CONFIRMED"]);

export function canCancelRental(status: string | null | undefined): boolean {
  return RENTAL_CANCELLABLE.has(status ?? "");
}

export const TRANSPORT_STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Owner has not priced delivery yet",
  QUOTED: "Delivery priced, customer to accept",
  ACCEPTED: "Delivery agreed",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  DECLINED: "Owner declined delivery",
  EXPIRED: "Delivery request expired",
  CANCELLED: "Delivery cancelled",
};

/** A delivery address on the wire is an object of strings; read it as one line. */
export function addressLine(value: unknown): string {
  if (!value || typeof value !== "object") return typeof value === "string" ? value : "";
  const parts = ["line", "address_line", "line1", "line2", "landmark", "area", "city", "pincode"]
    .map((key) => (value as Record<string, unknown>)[key])
    .filter((part): part is string => typeof part === "string" && part.trim() !== "");
  return parts.join(", ");
}

export const STAY_STATUS_LABEL: Record<string, string> = {
  HELD: "Held, not paid",
  PAYMENT_PENDING: "Waiting for payment",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  CHECKED_OUT: "Checked out",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

/** Ops cancel refunds in full, so it is offered only before the guest arrives. */
const STAY_CANCELLABLE = new Set(["HELD", "PAYMENT_PENDING", "CONFIRMED"]);

export function canCancelStay(status: string | null | undefined): boolean {
  return STAY_CANCELLABLE.has(status ?? "");
}

/** Case-insensitive match over the words an operator would type: a name, a phone, an id. */
export function matchesSearch(needle: string, haystack: (string | null | undefined)[]): boolean {
  const query = needle.trim().toLowerCase();
  if (!query) return true;
  return haystack.some((value) => (value ?? "").toLowerCase().includes(query));
}

/** Rupees typed by a person → integer paise, or null when it is not a usable amount. */
export function rupeesToPaise(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}
