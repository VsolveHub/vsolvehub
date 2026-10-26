import type { Schemas } from "@vsolve/api-client";

export type PickupHours = Schemas["PickupHours"];
export type PickupAddress = Schemas["PickupAddress"];
export type RentalTransport = Schemas["RentalTransport"];

const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** "09:00" -> "9 AM", "18:30" -> "6:30 PM". */
export function clockLabel(hhmm: string | null | undefined): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Monday = 0, matching the server, from a "YYYY-MM-DD" date. */
export function weekdayOf(isoDate: string): number | null {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  const jsDay = new Date(y, m - 1, d, 12).getDay(); // Sunday = 0
  return (jsDay + 6) % 7;
}

/** Has the owner taken this one date off (a holiday)? Checked by the server whatever the hours. */
export function isClosedDate(hours: PickupHours | null | undefined, isoDate: string): boolean {
  return Boolean(isoDate) && (hours?.closed_dates ?? []).includes(isoDate);
}

/**
 * Is the owner open on this date? A day off always closes it. Otherwise `true` when they have
 * not set hours yet: the server books those items without a weekday check, so the screen must
 * not refuse them either.
 */
export function isOpenOn(hours: PickupHours | null | undefined, isoDate: string): boolean {
  if (isClosedDate(hours, isoDate)) return false;
  if (!hours?.is_set) return true;
  const weekday = weekdayOf(isoDate);
  if (weekday === null) return true;
  return hours.days.find((d) => d.weekday === weekday)?.is_open ?? false;
}

/** "Sat 25 Oct", read as a calendar date and never shifted by the browser's time zone. */
function dateLabel(isoDate: string): string {
  const [y = 0, m = 1, d = 1] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "Mon, Tue, Sat" — the days a customer can pick instead. */
export function openDaysLabel(hours: PickupHours | null | undefined): string {
  if (!hours?.is_set) return "";
  return hours.days
    .filter((d) => d.is_open)
    .map((d) => SHORT_DAYS[d.weekday] ?? d.day_name)
    .join(", ");
}

/** The line for one day: "9 AM – 9 PM" or "Closed". */
export function dayHoursLabel(day: PickupHours["days"][number]): string {
  if (!day.is_open) return "Closed";
  return `${clockLabel(day.opens_at)} – ${clockLabel(day.closes_at)}`;
}

/** Why a chosen pickup/return date can't be used, or null when it can. */
export function closedDayMessage(
  hours: PickupHours | null | undefined,
  isoDate: string,
  what: "pickup" | "return",
): string | null {
  if (!isoDate || isOpenOn(hours, isoDate)) return null;
  if (isClosedDate(hours, isoDate)) {
    return `The owner is closed on ${dateLabel(isoDate)}. Choose another ${what} day.`;
  }
  const weekday = weekdayOf(isoDate);
  const dayName = weekday === null ? "that day" : `${hours?.days[weekday]?.day_name ?? "that day"}s`;
  return `The owner is closed on ${dayName}. Choose a ${what} day they are open: ${openDaysLabel(hours)}.`;
}

/** Full address on one line: "Plot 12, KPHB Colony, Kukatpally, Hyderabad 500072". */
export function addressLine(address: PickupAddress | null | undefined): string {
  if (!address) return "";
  const place = [address.line, address.area, address.city].map((p) => p.trim()).filter(Boolean);
  const text = place.join(", ");
  return address.pincode ? `${text} ${address.pincode}`.trim() : text;
}

export const TRANSPORT_TRIP_LABELS: Record<string, string> = {
  ONE_WAY: "Drop only",
  ROUND_TRIP: "Drop and collect",
};

/** What the customer sees for the delivery request at each step. */
export function transportStepLabel(status: string | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "REQUESTED":
      return "Waiting for the owner's transport price";
    case "QUOTED":
      return "Transport price received";
    case "ACCEPTED":
      return "Transport agreed";
    case "OUT_FOR_DELIVERY":
      return "Out for delivery";
    case "DELIVERED":
      return "Delivered";
    case "DECLINED":
      return "The owner can’t deliver this one";
    case "EXPIRED":
      return "Delivery request expired";
    case "CANCELLED":
      return "Delivery cancelled";
    default:
      return status ?? "";
  }
}
