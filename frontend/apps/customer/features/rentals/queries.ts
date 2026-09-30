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

export function fetchRentalAsset(assetId: string) {
  return request(() =>
    getApiClient().GET("/api/v1/rentals/{asset_id}", {
      params: {
        path: { asset_id: assetId },
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

export function bookRental(payload: {
  asset_id: string;
  start_date: string;
  end_date: string;
  pickup_or_delivery_mode?: string;
  notes?: string;
  quantity?: number;
}) {
  return request(() =>
    getApiClient().POST("/api/v1/rentals/book", {
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
