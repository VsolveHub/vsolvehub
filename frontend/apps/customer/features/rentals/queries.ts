"use client";

import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";
import type { RentalFilterParams } from "./model";

export type RentalAsset = Schemas["RentalAsset"];
export type RentalBooking = Schemas["RentalBooking"];
export type CreateBookingRequest = Schemas["CreateBookingRequest"];

export function fetchRentals(params?: RentalFilterParams) {
  return request(() =>
    getApiClient().GET("/api/v1/rentals", {
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
export function fetchRentalAsset(key: string) {
  return request(() =>
    getApiClient().GET("/api/v1/rentals/{key}", {
      params: {
        path: { key },
      },
    }),
  );
}

export function fetchMyRentals() {
  return request(() => getApiClient().GET("/api/v1/me/rentals"));
}

export function fetchRentalTaxonomy() {
  return request(() => getApiClient().GET("/api/v1/rentals/taxonomy"));
}

/** The live percent added on top of the rental fee. Zero means no platform fee. */
export function fetchRentalPlatformFee() {
  return request(() => getApiClient().GET("/api/v1/rentals/platform-fee"));
}

export function bookRental(payload: {
  asset_id: string;
  /** ISO date-times: when the customer collects and returns the item. */
  pickup_at: string;
  return_at: string;
  pickup_or_delivery_mode?: string;
  notes?: string;
  quantity?: number;
}) {
  return request(() =>
    getApiClient().POST("/api/v1/rentals/book", {
      body: {
        asset_id: payload.asset_id,
        pickup_at: payload.pickup_at,
        return_at: payload.return_at,
        quantity: payload.quantity ?? 1,
        pickup_or_delivery_mode: payload.pickup_or_delivery_mode ?? "PICKUP",
        notes: payload.notes ?? "",
      },
    }),
  );
}

/** Pre-handover cancel only (PENDING_PAYMENT | CONFIRMED). */
export function cancelRentalBooking(bookingId: string) {
  return request(() =>
    getApiClient().POST("/api/v1/me/rentals/{booking_id}/cancel", {
      params: { path: { booking_id: bookingId } },
    }),
  );
}

export function canCancelRentalBooking(status?: string): boolean {
  const value = (status ?? "").toUpperCase();
  return value === "PENDING_PAYMENT" || value === "CONFIRMED";
}
