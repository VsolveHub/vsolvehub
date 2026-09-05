import type { BookingGroup } from "@/features/bookings/queries";
import type { EngagementRowView } from "@/features/engagement/adapters";
import type { RequirementSummary } from "@/features/requirement/queries";

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

export function bookingStatusHref(tab: BookingStatusTab): string {
  return tab === DEFAULT_BOOKING_STATUS_TAB ? "/activity" : `/activity?status=${tab}`;
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
