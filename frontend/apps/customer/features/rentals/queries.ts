"use client";

import { request } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";
import type {
  RentalAsset,
  RentalBooking,
  RentalDeposit,
  RentalFilterParams,
  RentalPlatformFee,
} from "./model";

export type {
  RentalAsset,
  RentalBooking,
  RentalDeposit,
  RentalPlatformFee,
} from "./model";

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

export function fetchRentals(params?: RentalFilterParams): Promise<RentalAsset[]> {
  return callRentalApi<RentalAsset[]>("GET", "/api/v1/rentals", {
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
      },
    },
  });
}

/** `key` is the page slug; an old link's asset id works too. */
export function fetchRentalAsset(key: string): Promise<RentalAsset> {
  return callRentalApi<RentalAsset>("GET", "/api/v1/rentals/{key}", {
    params: {
      path: { key },
    },
  });
}

export function fetchMyRentals(): Promise<RentalBooking[]> {
  return callRentalApi<RentalBooking[]>("GET", "/api/v1/me/rentals");
}

export function fetchRentalTaxonomy(): Promise<unknown[]> {
  return callRentalApi<unknown[]>("GET", "/api/v1/rentals/taxonomy");
}

/** The live percent added on top of the rental fee. Zero means no platform fee. */
export function fetchRentalPlatformFee(): Promise<RentalPlatformFee> {
  return callRentalApi<RentalPlatformFee>("GET", "/api/v1/rentals/platform-fee");
}

export function bookRental(payload: {
  asset_id: string;
  start_date: string;
  end_date: string;
  pickup_or_delivery_mode?: string;
  notes?: string;
  quantity?: number;
}): Promise<RentalBooking> {
  return callRentalApi<RentalBooking>("POST", "/api/v1/rentals/book", {
    body: {
      asset_id: payload.asset_id,
      start_date: payload.start_date,
      end_date: payload.end_date,
      quantity: payload.quantity ?? 1,
      pickup_or_delivery_mode: payload.pickup_or_delivery_mode ?? "PICKUP",
      notes: payload.notes ?? "",
    },
  });
}

/** Pre-handover cancel only (PENDING_PAYMENT | CONFIRMED). */
export function cancelRentalBooking(bookingId: string): Promise<void> {
  return callRentalApi<void>("POST", "/api/v1/me/rentals/{booking_id}/cancel", {
    params: { path: { booking_id: bookingId } },
  });
}

export function canCancelRentalBooking(status?: string): boolean {
  const value = (status ?? "").toUpperCase();
  return value === "PENDING_PAYMENT" || value === "CONFIRMED";
}
