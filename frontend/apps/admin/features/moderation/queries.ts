import { request, type Schemas } from "@vsolve/api-client";
import type { Page } from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

export type OpsRentalAsset = Schemas["RentalAsset"];
export type OpsStayProperty = Schemas["Property"];
export type ModerationAction = "APPROVE" | "REJECT" | "REMOVE" | "REINSTATE";

export type OpsRentalDisputePhoto = {
  id: string;
  url: string;
};

export type OpsRentalDispute = {
  booking_id: string;
  asset_title: string;
  partner_name: string;
  reason: string;
  deposit_amount_paise: number;
  requested_consume_paise: number;
  consumed_paise: number;
  deposit_status: string;
  awaiting_decision: boolean;
  photos: OpsRentalDisputePhoto[];
};

type OpsClientResult<T> = {
  data?: T;
  error?: unknown;
  response: Response;
};

function opsGet<T>(path: string): Promise<OpsClientResult<T>> {
  const get = getApiClient().GET as unknown as (url: string) => Promise<OpsClientResult<T>>;
  return get(path);
}

function opsPost<T>(path: string, body: unknown): Promise<OpsClientResult<T>> {
  const post = getApiClient().POST as unknown as (
    url: string,
    init: { body: unknown },
  ) => Promise<OpsClientResult<T>>;
  return post(path, { body });
}

export async function fetchOpsRentalDisputes(): Promise<OpsRentalDispute[]> {
  const data = await request(() => opsGet<OpsRentalDispute[]>("/api/v1/ops/rentals/disputes"));
  return Array.isArray(data) ? data : [];
}

export async function decideOpsRentalDispute(
  bookingId: string,
  decision: "APPROVE" | "REJECT",
): Promise<OpsRentalDispute> {
  return request(() =>
    opsPost<OpsRentalDispute>(`/api/v1/ops/rentals/disputes/${bookingId}/decision`, { decision }),
  );
}

/** One page of rental listings; `moderationStatus` "PENDING" is the review queue. */
export function fetchOpsRentalsPage(
  cursor?: string,
  moderationStatus?: string,
): Promise<Page<OpsRentalAsset>> {
  return request(() =>
    getApiClient().GET("/api/v1/ops/rentals", {
      params: {
        query: {
          ...(cursor ? { cursor } : {}),
          ...(moderationStatus ? { moderation_status: moderationStatus } : {}),
        },
      },
    }),
  );
}

export async function moderateOpsRental(
  assetId: string,
  action: ModerationAction,
  reason: string,
): Promise<void> {
  await request(() =>
    getApiClient().POST("/api/v1/ops/rentals/{asset_id}/moderate", {
      params: { path: { asset_id: assetId } },
      body: { action, reason },
    }),
  );
}

/** One page of stay properties; `moderationStatus` "PENDING" is the review queue. */
export function fetchOpsStaysPage(
  cursor?: string,
  moderationStatus?: string,
): Promise<Page<OpsStayProperty>> {
  return request(() =>
    getApiClient().GET("/api/v1/ops/stays", {
      params: {
        query: {
          ...(cursor ? { cursor } : {}),
          ...(moderationStatus ? { moderation_status: moderationStatus } : {}),
        },
      },
    }),
  );
}

export function fetchOpsRentalPlatformFee() {
  return request(() => getApiClient().GET("/api/v1/ops/rentals/platform-fee"));
}

export function saveOpsRentalPlatformFee(percent: number) {
  return request(() =>
    getApiClient().PUT("/api/v1/ops/rentals/platform-fee", {
      body: { percent },
    }),
  );
}

export async function moderateOpsStay(
  propertyId: string,
  action: ModerationAction,
  reason: string,
): Promise<void> {
  await request(() =>
    getApiClient().POST("/api/v1/ops/stays/{property_id}/moderate", {
      params: { path: { property_id: propertyId } },
      body: { action, reason },
    }),
  );
}

export type OpsStayReservation = Schemas["StayReservation"];
export type OpsStayEnquiry = Schemas["StayEnquiry"];

export function fetchOpsStayReservationsPage(
  cursor: string | undefined,
  filters: { status?: string; q?: string } = {},
): Promise<Page<OpsStayReservation>> {
  return request(() =>
    getApiClient().GET("/api/v1/ops/stays/reservations", {
      params: {
        query: {
          ...(cursor ? { cursor } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.q ? { q: filters.q } : {}),
        },
      },
    }),
  );
}

export function fetchOpsStayEnquiriesPage(cursor?: string): Promise<Page<OpsStayEnquiry>> {
  return request(() =>
    getApiClient().GET("/api/v1/ops/stays/enquiries", {
      params: { query: cursor ? { cursor } : {} },
    }),
  );
}

/* --- Bookings and plans: what Operations runs after a listing is live ------------------- */

export type OpsRentalBooking = Schemas["OpsRentalBooking"];
export type OpsRentalBookingStatus = Schemas["RentalBookingStatusEnum"];
export type OpsStaySubscriptionPlan = Schemas["StaySubscriptionPlan"];

export function fetchOpsRentalBookingsPage(
  cursor: string | undefined,
  filters: { status?: string; q?: string } = {},
): Promise<Page<OpsRentalBooking>> {
  return request(() =>
    getApiClient().GET("/api/v1/ops/rentals/bookings", {
      params: {
        query: {
          ...(cursor ? { cursor } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.q ? { q: filters.q } : {}),
        },
      },
    }),
  );
}

export function cancelOpsRentalBooking(bookingId: string, reason: string) {
  return request(() =>
    getApiClient().POST("/api/v1/ops/rentals/bookings/{booking_id}/cancel", {
      params: { path: { booking_id: bookingId } },
      body: { reason },
    }),
  );
}

export function cancelOpsStayReservation(reservationId: string, reason: string) {
  return request(() =>
    getApiClient().POST("/api/v1/ops/stays/reservations/{reservation_id}/cancel", {
      params: { path: { reservation_id: reservationId } },
      body: { reason },
    }),
  );
}

export async function fetchOpsStayPlans(): Promise<OpsStaySubscriptionPlan[]> {
  const data = await request(() => getApiClient().GET("/api/v1/ops/stay-subscription-plans"));
  return Array.isArray(data) ? data : [];
}

export type StayPlanDraft = {
  code: string;
  name: string;
  price_paise: number;
  duration_days: number;
  max_properties: number;
  details: string;
  is_active: boolean;
};

export function createOpsStayPlan(draft: StayPlanDraft) {
  return request(() =>
    getApiClient().POST("/api/v1/ops/stay-subscription-plans", { body: draft }),
  );
}

export function updateOpsStayPlan(planId: string, draft: Omit<StayPlanDraft, "code">) {
  return request(() =>
    getApiClient().PATCH("/api/v1/ops/stay-subscription-plans/{plan_id}", {
      params: { path: { plan_id: planId } },
      body: draft,
    }),
  );
}
