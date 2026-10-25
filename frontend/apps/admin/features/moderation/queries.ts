import { request, type Schemas } from "@vsolve/api-client";
import { fetchAllPages, type Page } from "@vsolve/query";

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

function opsPatch<T>(path: string, body: unknown): Promise<OpsClientResult<T>> {
  const patch = getApiClient().PATCH as unknown as (
    url: string,
    init: { body: unknown },
  ) => Promise<OpsClientResult<T>>;
  return patch(path, { body });
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

export async function fetchOpsRentals(): Promise<OpsRentalAsset[]> {
  const data = await request(() => getApiClient().GET("/api/v1/ops/rentals"));
  return Array.isArray(data) ? data : [];
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

// The stays endpoints return cursor pages, so the "every row" fetchers walk the pages rather than
// reading the envelope as if it were an array, which made every list come back empty.
export function fetchOpsStays(): Promise<OpsStayProperty[]> {
  return fetchAllPages((cursor) => fetchOpsStaysPage(cursor));
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

export function fetchOpsStayReservations(): Promise<OpsStayReservation[]> {
  return fetchAllPages((cursor) => fetchOpsStayReservationsPage(cursor));
}

export function fetchOpsStayReservationsPage(
  cursor?: string,
  params?: { status?: string; q?: string },
): Promise<Page<OpsStayReservation>> {
  return request(() =>
    getApiClient().GET("/api/v1/ops/stays/reservations", {
      params: { query: { cursor, status: params?.status, q: params?.q } },
    }),
  );
}

export function fetchOpsStayEnquiries(): Promise<OpsStayEnquiry[]> {
  return fetchAllPages((cursor) => fetchOpsStayEnquiriesPage(cursor));
}

export function fetchOpsStayEnquiriesPage(cursor?: string): Promise<Page<OpsStayEnquiry>> {
  return request(() =>
    getApiClient().GET("/api/v1/ops/stays/enquiries", { params: { query: { cursor } } }),
  );
}

export async function cancelOpsStayReservation(reservationId: string, reason: string): Promise<void> {
  await request(() =>
    getApiClient().POST("/api/v1/ops/stays/reservations/{reservation_id}/cancel", {
      params: { path: { reservation_id: reservationId } },
      body: { reason },
    }),
  );
}

/** The listings endpoint returns every asset in one array and takes no filters, so this is one page. */
export async function fetchOpsRentalsPage(): Promise<Page<OpsRentalAsset>> {
  return { results: await fetchOpsRentals(), next: null };
}

export function fetchOpsStaysPage(
  cursor?: string,
  moderationStatus?: string,
): Promise<Page<OpsStayProperty>> {
  return request(() =>
    getApiClient().GET("/api/v1/ops/stays", {
      params: { query: { cursor, moderation_status: moderationStatus } },
    }),
  );
}

export type OpsRentalBooking = {
  id: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  quantity?: number;
  customer_name?: string;
  customer_phone?: string;
  partner_name?: string;
  amount_due_paise?: number;
  price_paise?: number;
  transport_paise?: number;
  deposit?: { amount_paise?: number };
  pickup_or_delivery_mode?: string;
  delivery_address?: unknown;
  cancellation_reason?: string;
  transport?: { status?: string; quote_paise?: number };
  asset?: { title?: string };
};

/**
 * The API has no rental-bookings list today: the backend view went in 4ad77c4b and the contract no
 * longer carries the path. This request therefore fails, and the screen shows that failure instead
 * of an empty list. It needs no change once the endpoint is back.
 */
export function fetchOpsRentalBookingsPage(
  cursor?: string,
  params?: { status?: string; q?: string },
): Promise<Page<OpsRentalBooking>> {
  const query = new URLSearchParams({
    ...(params?.status ? { status: params.status } : {}),
    ...(params?.q ? { q: params.q } : {}),
    ...(cursor ? { cursor } : {}),
  });
  return request(() => opsGet<Page<OpsRentalBooking>>(`/api/v1/ops/rentals/bookings?${query.toString()}`));
}

// The cancel endpoint currently takes no body, so the reason is not stored server-side (4ad77c4b
// removed the column). It is still sent, for when the backend records it again.
export async function cancelOpsRentalBooking(bookingId: string, reason: string): Promise<void> {
  await request(() => opsPost(`/api/v1/ops/rentals/bookings/${bookingId}/cancel`, { reason }));
}

export type OpsStaySubscriptionPlan = {
  id: string;
  code: string;
  name: string;
  price_paise: number;
  duration_days: number;
  max_properties: number;
  details?: string;
  is_active: boolean;
};

export type StayPlanDraft = {
  code: string;
  name: string;
  price_paise: number;
  duration_days: number;
  max_properties: number;
  details?: string;
  is_active: boolean;
};

export async function fetchOpsStayPlans(): Promise<OpsStaySubscriptionPlan[]> {
  const data = await request(() => opsGet<OpsStaySubscriptionPlan[]>("/api/v1/ops/stay-subscription-plans"));
  return Array.isArray(data) ? data : [];
}

export async function createOpsStayPlan(body: StayPlanDraft): Promise<OpsStaySubscriptionPlan> {
  return request(() => opsPost<OpsStaySubscriptionPlan>("/api/v1/ops/stay-subscription-plans", body));
}

export async function updateOpsStayPlan(
  planId: string,
  body: Partial<StayPlanDraft>,
): Promise<OpsStaySubscriptionPlan> {
  return request(() => opsPatch<OpsStaySubscriptionPlan>(`/api/v1/ops/stay-subscription-plans/${planId}`, body));
}


