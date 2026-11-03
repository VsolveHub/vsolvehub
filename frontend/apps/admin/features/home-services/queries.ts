import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

export type HomeBookingRow = Schemas["OperationsBookingRow"];
export type HomeBookingPage = Schemas["OperationsBookingPage"];

export interface HomeBookingFilters {
  status?: string;
  q?: string;
  late?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

/** One page of home-service visits, newest first. Every filter is applied on the server. */
export function fetchHomeBookingsPage(
  cursor: string | undefined,
  filters: HomeBookingFilters,
): Promise<HomeBookingPage> {
  return request(() =>
    getApiClient().GET("/api/v1/operations/bookings/", {
      params: {
        query: {
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.q ? { q: filters.q } : {}),
          ...(filters.late ? { late: true } : {}),
          ...(filters.dateFrom ? { date_from: filters.dateFrom } : {}),
          ...(filters.dateTo ? { date_to: filters.dateTo } : {}),
          ...(cursor ? { cursor } : {}),
        },
      },
    }),
  );
}

/** The quick filters above the list, each one a server `status` list. Exported for tests. */
export const STATUS_GROUPS = [
  { key: "", label: "All", status: "" },
  { key: "upcoming", label: "Upcoming", status: "CONFIRMED,EN_ROUTE" },
  { key: "in_progress", label: "In progress", status: "ARRIVED,IN_PROGRESS,COMPLETION_SUBMITTED" },
  { key: "needs_help", label: "Needs help", status: "DISPUTED,RECOVERY_REQUIRED" },
  { key: "completed", label: "Completed", status: "COMPLETED,PARTIALLY_COMPLETED" },
  { key: "cancelled", label: "Cancelled", status: "CANCELLED,ABORTED" },
] as const;

export type StatusGroupKey = (typeof STATUS_GROUPS)[number]["key"];

export function statusForGroup(key: StatusGroupKey): string {
  return STATUS_GROUPS.find((group) => group.key === key)?.status ?? "";
}
