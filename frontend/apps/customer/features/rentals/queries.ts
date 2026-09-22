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
          min_price: params?.min_price,
          max_price: params?.max_price,
          max_deposit: params?.max_deposit,
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

export function bookRental(payload: {
  asset_id: string;
  start_date: string;
  end_date: string;
  pickup_or_delivery_mode?: string;
  notes?: string;
}) {
  return request(() =>
    getApiClient().POST("/api/v1/rentals/book", {
      body: {
        asset_id: payload.asset_id,
        start_date: payload.start_date,
        end_date: payload.end_date,
        pickup_or_delivery_mode: payload.pickup_or_delivery_mode ?? "PICKUP",
        notes: payload.notes ?? "",
      },
    }),
  );
}
