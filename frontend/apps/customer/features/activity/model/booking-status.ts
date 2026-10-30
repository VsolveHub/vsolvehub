import type { BookingGroup } from "@/features/bookings/queries";
import type { EngagementRowView } from "@/features/engagement/adapters";
import type { RentalBooking } from "@/features/rentals/model";
import type { RequirementSummary } from "@/features/requirement/queries";
import type { StayEnquiry, StayReservation, StayVisit } from "@/features/stays/queries";

/**
 * The three Bookings hub views. Backend statuses stay as published; this is
 * only the UI bucket each row belongs in.
 */
export const BOOKING_STATUS_TABS = ["active", "past", "cancelled"] as const;
export type BookingStatusTab = (typeof BOOKING_STATUS_TABS)[number];

export const DEFAULT_BOOKING_STATUS_TAB: BookingStatusTab = "active";

const CANCELLED_REQUESTS: ReadonlySet<RequirementSummary["status"]> = new Set([
  "CLOSED_CANCELLED",
  "CLOSED_ABANDONED",
]);

const PAST_REQUESTS: ReadonlySet<RequirementSummary["status"]> = new Set([
  "CLOSED_NO_SUPPLY",
  "CLOSED_SLA_BREACH",
  "CLOSED_EXPIRED",
  "CLOSED_COMPLETE",
]);

export const BOOKING_STATUS_COPY: Record<
  BookingStatusTab,
  { label: string; title: string; description: string; emptyTitle: string; emptyDescription: string }
> = {
  active: {
    label: "Upcoming & Active",
    title: "Upcoming & Active",
    description: "Visits, requests and work still moving.",
    emptyTitle: "No upcoming bookings",
    emptyDescription: "You don't have any active or upcoming bookings yet.",
  },
  past: {
    label: "Past",
    title: "Past",
    description: "Finished, completed or closed work.",
    emptyTitle: "No past bookings",
    emptyDescription: "Your completed bookings will appear here.",
  },
  cancelled: {
    label: "Cancelled",
    title: "Cancelled",
    description: "Bookings that were cancelled or stopped.",
    emptyTitle: "No cancelled bookings",
    emptyDescription: "You don't have any cancelled bookings.",
  },
};

export function toBookingStatusTab(value: string | string[] | null | undefined): BookingStatusTab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "past" || raw === "cancelled" || raw === "active") return raw;
  return DEFAULT_BOOKING_STATUS_TAB;
}

/**
 * What kind of thing a booking is, for the filter above the tabs. `services` is everything
 * booked through the service catalog: visits, crew and projects.
 */
export const BOOKING_TYPES = ["services", "rentals", "stays"] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];

export const BOOKING_TYPE_LABELS: Record<BookingType, string> = {
  services: "Services",
  rentals: "Rentals",
  stays: "Stays",
};

export function toBookingType(value: string | string[] | null | undefined): BookingType | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return BOOKING_TYPES.find((type) => type === raw) ?? null;
}

/** The hub's address: the status tab and, when chosen, the type. Defaults are left out. */
export function bookingStatusHref(tab: BookingStatusTab, type: BookingType | null = null): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_BOOKING_STATUS_TAB) params.set("status", tab);
  if (type) params.set("type", type);
  const query = params.toString();
  return query ? `/activity?${query}` : "/activity";
}

export function requestSection(status: RequirementSummary["status"]): BookingStatusTab {
  if (CANCELLED_REQUESTS.has(status)) return "cancelled";
  if (PAST_REQUESTS.has(status)) return "past";
  return "active";
}

export function engagementSection(row: EngagementRowView): BookingStatusTab {
  if (row.status === "CANCELLED") return "cancelled";
  if (row.status === "COMPLETED" || row.status === "CLOSED" || row.status === "WARRANTY") {
    return "past";
  }
  return "active";
}

export function groupSection(group: BookingGroup): BookingStatusTab {
  if (group.status === "CANCELLED") return "cancelled";
  if (group.status === "COMPLETED" || group.status === "EXPIRED" || group.status === "FAILED") {
    return "past";
  }
  return "active";
}

export function countByStatus<T extends { section: BookingStatusTab }>(
  items: readonly T[],
): Record<BookingStatusTab, number> {
  return {
    active: items.filter((item) => item.section === "active").length,
    past: items.filter((item) => item.section === "past").length,
    cancelled: items.filter((item) => item.section === "cancelled").length,
  };
}

/** Today as `YYYY-MM-DD` in local time, to compare with a visit or check-in date. */
function todayIso(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * A rental is active from the request until it is returned. A dispute stays active: it still
 * needs the customer.
 */
export function rentalSection(booking: Pick<RentalBooking, "status">): BookingStatusTab {
  if (booking.status === "CANCELLED") return "cancelled";
  if (booking.status === "RETURNED") return "past";
  return "active";
}

/** A requested visit is active; an accepted one until its day has passed. */
export function stayVisitSection(
  visit: Pick<StayVisit, "status" | "visit_date">,
  now: Date = new Date(),
): BookingStatusTab {
  if (visit.status === "DECLINED" || visit.status === "CANCELLED") return "cancelled";
  if (visit.status === "EXPIRED") return "past";
  if (visit.status === "ACCEPTED" && visit.visit_date && visit.visit_date < todayIso(now)) return "past";
  return "active";
}

/** An enquiry is active while it waits or is answered; a confirmed one until check-in has passed. */
export function stayEnquirySection(
  enquiry: Pick<StayEnquiry, "status" | "check_in">,
  now: Date = new Date(),
): BookingStatusTab {
  if (enquiry.status === "DECLINED" || enquiry.status === "WITHDRAWN" || enquiry.status === "CANCELLED") {
    return "cancelled";
  }
  if (enquiry.status === "EXPIRED") return "past";
  if (enquiry.status === "CONFIRMED" && enquiry.check_in && enquiry.check_in < todayIso(now)) return "past";
  return "active";
}

export function stayReservationSection(reservation: Pick<StayReservation, "status">): BookingStatusTab {
  if (reservation.status === "CANCELLED") return "cancelled";
  if (reservation.status === "CHECKED_OUT" || reservation.status === "NO_SHOW") return "past";
  return "active";
}
