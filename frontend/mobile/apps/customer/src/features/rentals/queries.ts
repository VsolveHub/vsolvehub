import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";

import type { RentalAsset, RentalBooking, RentalFilterParams } from "./model";

export type { RentalAsset, RentalBooking };
export type CreateBookingRequest = any;

export function fetchRentals(params?: RentalFilterParams): Promise<RentalAsset[]> {
  return request(() =>
    (getApiClient() as any).GET("/api/v1/rentals", {
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
    }),
  );
}

/** `key` is the page slug; an old link's asset id works too. */
export function fetchRentalAsset(key: string): Promise<RentalAsset> {
  return request(() =>
    (getApiClient() as any).GET("/api/v1/rentals/{key}", {
      params: {
        path: { key },
      },
    }),
  );
}

export function fetchMyRentals(): Promise<RentalBooking[]> {
  return request(() => (getApiClient() as any).GET("/api/v1/me/rentals"));
}

export function fetchRentalTaxonomy(): Promise<any[]> {
  return request(() => (getApiClient() as any).GET("/api/v1/rentals/taxonomy"));
}

/** The live percent added on top of the rental fee. Zero means no platform fee. */
export function fetchRentalPlatformFee(): Promise<{ percent: number }> {
  return request(() => (getApiClient() as any).GET("/api/v1/rentals/platform-fee"));
}

export function bookRental(payload: {
  asset_id: string;
  start_date: string;
  end_date: string;
  pickup_or_delivery_mode?: string;
  notes?: string;
  quantity?: number;
}): Promise<RentalBooking> {
  return request(() =>
    (getApiClient() as any).POST("/api/v1/rentals/book", {
      body: {
        asset_id: payload.asset_id,
        start_date: payload.start_date,
        end_date: payload.end_date,
        quantity: payload.quantity ?? 1,
        pickup_or_delivery_mode: payload.pickup_or_delivery_mode ?? "PICKUP",
        notes: payload.notes ?? "",
      },
    }),
  );
}

/** Pre-handover cancel only (PENDING_PAYMENT | CONFIRMED). */
export function cancelRentalBooking(bookingId: string): Promise<any> {
  return request(() =>
    (getApiClient() as any).POST("/api/v1/me/rentals/{booking_id}/cancel", {
      params: { path: { booking_id: bookingId } },
    }),
  );
}

export function canCancelRentalBooking(status?: string): boolean {
  const value = (status ?? "").toUpperCase();
  return value === "PENDING_PAYMENT" || value === "CONFIRMED";
}
