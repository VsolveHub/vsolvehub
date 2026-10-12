"use client";

import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";
import type { RentalFilterParams } from "./model";

export type RentalAsset = Schemas["RentalAsset"];
export type RentalAssetDetail = Schemas["RentalAssetDetail"];
export type RentalBooking = Schemas["RentalBooking"];
export type CreateBookingRequest = Schemas["CreateBookingRequest"];

export function fetchRentals(params?: RentalFilterParams & { limit?: number; offset?: number }) {
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
          limit: params?.limit,
          offset: params?.offset,
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

export function fetchMyRentalsPage(cursor?: string, status?: string) {
  return request(() =>
    getApiClient().GET("/api/v1/me/rentals", {
      params: { query: { ...(cursor ? { cursor } : {}), ...(status ? { status } : {}) } },
    }),
  );
}

export function fetchRentalTaxonomy() {
  return request(() => getApiClient().GET("/api/v1/rentals/taxonomy"));
}

/** The live percent added on top of the rental fee. Zero means no platform fee. */
export function fetchRentalPlatformFee() {
  return request(() => getApiClient().GET("/api/v1/rentals/platform-fee"));
}

export type DeliveryAddress = Schemas["DeliveryAddressRequest"];
export type RentalMode = Schemas["RentalBookingModeEnum"];

export function bookRental(payload: {
  asset_id: string;
  start_date: string;
  end_date: string;
  pickup_or_delivery_mode?: RentalMode;
  delivery_address?: DeliveryAddress;
  delivery_note?: string;
  notes?: string;
  quantity?: number;
}) {
  const mode = payload.pickup_or_delivery_mode ?? "PICKUP";
  return request(() =>
    getApiClient().POST("/api/v1/rentals/book", {
      body: {
        asset_id: payload.asset_id,
        start_date: payload.start_date,
        end_date: payload.end_date,
        quantity: payload.quantity ?? 1,
        pickup_or_delivery_mode: mode,
        ...(mode === "DELIVERY" ? { delivery_address: payload.delivery_address } : {}),
        delivery_note: mode === "DELIVERY" ? (payload.delivery_note ?? "") : "",
        notes: payload.notes ?? "",
      },
    }),
  );
}

/**
 * The customer's answer on a delivery request.
 *
 * `accept` agrees the owner's transport price and starts the one payment for rent, fee,
 * deposit and transport. `switch-to-pickup` drops delivery and starts the pickup payment.
 */
export function rentalTransportAction(
  bookingId: string,
  action: "accept" | "reject" | "switch-to-pickup",
  note = "",
) {
  return request(() =>
    getApiClient().POST("/api/v1/me/rentals/{booking_id}/transport/{action}", {
      params: { path: { booking_id: bookingId, action } },
      body: { note },
    }),
  );
}

/** Pre-handover cancel only (AWAITING_TRANSPORT_QUOTE | PENDING_PAYMENT | CONFIRMED). */
export function cancelRentalBooking(bookingId: string) {
  return request(() =>
    getApiClient().POST("/api/v1/me/rentals/{booking_id}/cancel", {
      params: { path: { booking_id: bookingId } },
    }),
  );
}

export function canCancelRentalBooking(status?: string): boolean {
  const value = (status ?? "").toUpperCase();
  return value === "AWAITING_TRANSPORT_QUOTE" || value === "PENDING_PAYMENT" || value === "CONFIRMED";
}
