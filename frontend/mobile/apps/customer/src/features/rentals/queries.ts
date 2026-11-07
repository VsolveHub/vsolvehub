import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import type { Page } from "@vsolve/query/native";

import type {
  CreateBookingRequest,
  RentalAsset,
  RentalBooking,
  RentalFilterParams,
  RentalTaxonomySubcategory,
} from "./model";

export type { CreateBookingRequest, RentalAsset, RentalBooking };

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestParams {
  query?: Record<string, string | number | boolean | undefined>;
  path?: Record<string, string>;
}

interface RequestInitOptions {
  params?: RequestParams;
  body?: unknown;
  bodySerializer?: (body: unknown) => unknown;
}

type ApiOperation<T> = (
  path: string,
  init?: RequestInitOptions,
) => Promise<{ data?: T; error?: unknown; response: Response }>;

function getClientMethod<T>(client: object, method: HttpMethod): ApiOperation<T> {
  const methodFn = Reflect.get(client, method) as ApiOperation<T>;
  return methodFn;
}

export function callRentalApi<T>(
  method: HttpMethod,
  path: string,
  options?: RequestInitOptions,
): Promise<T> {
  const client = getApiClient();
  const methodFn = getClientMethod<T>(client, method);
  return request(() => Reflect.apply(methodFn, client, [path, options]) as Promise<{
    data?: T;
    error?: unknown;
    response: Response;
  }>);
}

export async function fetchRentals(params?: RentalFilterParams): Promise<RentalAsset[]> {
  const data = await callRentalApi<RentalAsset[] | { results?: RentalAsset[] }>("GET", "/api/v1/rentals", {
    params: {
      query: {
        q: params?.q,
        location: params?.location,
        service: params?.service,
        category: params?.category,
        min_price: params?.min_price,
        max_price: params?.max_price,
        max_deposit: params?.max_deposit,
        start_date: params?.start_date,
        end_date: params?.end_date,
        lat: params?.lat,
        lng: params?.lng,
        limit: params?.limit,
        offset: params?.offset,
      },
    },
  });
  if (Array.isArray(data)) return data;
  if (data && Array.isArray((data as { results?: RentalAsset[] }).results)) {
    return (data as { results: RentalAsset[] }).results;
  }
  return [];
}

/** `key` is the page slug; an old link's asset id works too. */
export function fetchRentalAsset(key: string): Promise<RentalAsset> {
  return callRentalApi<RentalAsset>("GET", "/api/v1/rentals/{key}", {
    params: {
      path: { key },
    },
  });
}

export async function fetchMyRentals(): Promise<RentalBooking[]> {
  const data = await callRentalApi<RentalBooking[] | { results?: RentalBooking[] }>("GET", "/api/v1/me/rentals");
  if (Array.isArray(data)) return data;
  if (data && Array.isArray((data as { results?: RentalBooking[] }).results)) {
    return (data as { results: RentalBooking[] }).results;
  }
  return [];
}

/**
 * Paged slice of the customer's rentals, newest first.
 * Filtered on the server, so a tab never hides rows that sit on a page not yet loaded.
 */
export function fetchMyRentalsPage(
  statuses?: string,
  cursor?: string,
): Promise<Page<RentalBooking>> {
  return callRentalApi<Page<RentalBooking>>("GET", "/api/v1/me/rentals", {
    params: { query: { status: statuses || undefined, cursor } },
  });
}

export function fetchRentalTaxonomy(): Promise<RentalTaxonomySubcategory[]> {
  return callRentalApi<RentalTaxonomySubcategory[]>("GET", "/api/v1/rentals/taxonomy");
}

/** The live percent added on top of the rental fee. Zero means no platform fee. */
export function fetchRentalPlatformFee(): Promise<{ percent: number }> {
  return callRentalApi<{ percent: number }>("GET", "/api/v1/rentals/platform-fee");
}

export function bookRental(payload: CreateBookingRequest): Promise<RentalBooking> {
  const mode = payload.pickup_or_delivery_mode ?? "PICKUP";
  return callRentalApi<RentalBooking>("POST", "/api/v1/rentals/book", {
    body: {
      asset_id: payload.asset_id,
      start_date: payload.start_date,
      end_date: payload.end_date,
      quantity: payload.quantity ?? 1,
      pickup_or_delivery_mode: mode,
      ...(mode === "DELIVERY" && payload.delivery_address ? { delivery_address: payload.delivery_address } : {}),
      delivery_note: mode === "DELIVERY" ? (payload.delivery_note ?? "") : "",
      notes: payload.notes ?? "",
    },
  });
}

/**
 * The customer's answer on a delivery request.
 * `accept` agrees the owner's transport price and starts the one payment for rent, fee,
 * deposit and transport. `switch-to-pickup` drops delivery and starts the pickup payment.
 */
export function rentalTransportAction(
  bookingId: string,
  action: "accept" | "reject" | "switch-to-pickup",
  note = "",
): Promise<unknown> {
  return callRentalApi<unknown>("POST", "/api/v1/me/rentals/{booking_id}/transport/{action}", {
    params: { path: { booking_id: bookingId, action } },
    body: { note },
  });
}

/** Pre-handover cancel only (AWAITING_TRANSPORT_QUOTE | PENDING_PAYMENT | CONFIRMED). */
export function cancelRentalBooking(bookingId: string): Promise<void> {
  return callRentalApi<void>("POST", "/api/v1/me/rentals/{booking_id}/cancel", {
    params: { path: { booking_id: bookingId } },
  });
}

export function canCancelRentalBooking(status?: string): boolean {
  const value = (status ?? "").toUpperCase();
  return value === "AWAITING_TRANSPORT_QUOTE" || value === "PENDING_PAYMENT" || value === "CONFIRMED";
}
