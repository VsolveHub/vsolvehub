import { request, type Schemas, type operations } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

export type WorkforceRequestRow = Schemas["OperationsRequestRow"];
export type WorkforceRequestPage = Schemas["OperationsRequestPage"];
export type WorkforceArchetype = "A3_TIME_BLOCK" | "A5_CUSTOM_PROJECT";
export type StuckQueueCode = NonNullable<
  NonNullable<operations["operations_requests_list"]["parameters"]["query"]>["stuck"]
>;

export interface WorkforceRequestFilters {
  status?: string;
  open?: boolean;
  archetype?: WorkforceArchetype;
  /** One stuck-queue code: only the requests in that queue. */
  stuck?: StuckQueueCode;
  q?: string;
}

/** One page of crew and project requests, newest first, filtered on the server. */
export function fetchWorkforceRequestsPage(
  cursor: string | undefined,
  filters: WorkforceRequestFilters,
): Promise<WorkforceRequestPage> {
  return request(() =>
    getApiClient().GET("/api/v1/operations/requests/", {
      params: {
        query: {
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.open ? { open: true } : {}),
          ...(filters.archetype ? { archetype: filters.archetype } : {}),
          ...(filters.stuck ? { stuck: filters.stuck } : {}),
          ...(filters.q ? { q: filters.q } : {}),
          ...(cursor ? { cursor } : {}),
        },
      },
    }),
  );
}

/** What each request state means to an operator, in their words. Exported for tests. */
export const REQUEST_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  MATCHING: "Finding vendors",
  VISITS_BOOKED: "Site visits booked",
  QUOTES_READY: "Quotes ready",
  UNLOCKED: "Quotes unlocked",
  SELECTED: "Vendor chosen",
  ENGAGED: "Work in progress",
  CLOSED_NO_SUPPLY: "Closed: no vendor",
  CLOSED_SLA_BREACH: "Closed: promise missed",
  CLOSED_EXPIRED: "Closed: date passed",
  CLOSED_ABANDONED: "Closed: abandoned",
  CLOSED_COMPLETE: "Completed",
  CLOSED_CANCELLED: "Cancelled",
};

export const ARCHETYPE_LABEL: Record<WorkforceArchetype, string> = {
  A3_TIME_BLOCK: "Crew hire",
  A5_CUSTOM_PROJECT: "Project",
};

/** Quick filters above the list. `open` and `status` are applied on the server. */
export const REQUEST_GROUPS = [
  { key: "open", label: "Open", filters: { open: true } },
  { key: "engaged", label: "Work in progress", filters: { status: "ENGAGED" } },
  { key: "completed", label: "Completed", filters: { status: "CLOSED_COMPLETE" } },
  {
    key: "closed_other",
    label: "Closed without work",
    filters: {
      status: "CLOSED_NO_SUPPLY,CLOSED_SLA_BREACH,CLOSED_EXPIRED,CLOSED_ABANDONED,CLOSED_CANCELLED",
    },
  },
  { key: "total", label: "All", filters: {} },
] as const satisfies readonly { key: string; label: string; filters: WorkforceRequestFilters }[];

export type RequestGroupKey = (typeof REQUEST_GROUPS)[number]["key"];
