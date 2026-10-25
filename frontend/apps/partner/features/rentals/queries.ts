"use client";

import { request, type Schemas } from "@vsolve/api-client";
import type { Page } from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

export type RentalAsset = Schemas["RentalAsset"];
export type PartnerRentalAsset = RentalAsset;
export type RentalBooking = Schemas["RentalBooking"];
/** The owner's view of a booking: adds the renter's name and phone. */
export type PartnerRentalBooking = Schemas["PartnerRentalBooking"];
export type CreateAssetRequest = Schemas["CreateAssetRequest"];
export type UpdateAssetRequest = Schemas["PatchedUpdateAssetRequest"];
export type PartnerCapability = Schemas["PartnerCapability"];
export type PartnerBookingActionRequest = Schemas["PartnerBookingActionRequest"];

export type RentalTaxonomyVariant = {
  id: string;
  name: string;
  code: string;
  asset_schema: Record<string, unknown>;
  default_deposit_paise: number;
};

export type RentalTaxonomyService = {
  id: string;
  name: string;
  slug: string;
  variants: RentalTaxonomyVariant[];
};

export type RentalTaxonomySubcategory = {
  id: string;
  name: string;
  slug: string;
  services: RentalTaxonomyService[];
};

export async function fetchRentalTaxonomy(): Promise<RentalTaxonomySubcategory[]> {
  const data = await request(() => getApiClient().GET("/api/v1/rentals/taxonomy"));
  return Array.isArray(data) ? (data as RentalTaxonomySubcategory[]) : [];
}

export async function fetchPartnerDefaultLocation(): Promise<string> {
  try {
    const data = await request(() => getApiClient().GET("/api/v1/partner/me/"));
    return (data.default_location_text ?? "").trim();
  } catch {
    return "";
  }
}

export async function fetchPartnerRentalAssets(): Promise<PartnerRentalAsset[]> {
  const data = await request(() => getApiClient().GET("/api/v1/partner/rentals/assets"));
  return Array.isArray(data) ? data : [];
}

export async function fetchPartnerRentalBookings(status?: string): Promise<PartnerRentalBooking[]> {
  const data = await request(() =>
    getApiClient().GET("/api/v1/partner/rentals/bookings", {
      params: status ? { query: { status } } : undefined,
    }),
  );
  return Array.isArray(data) ? data : [];
}

/**
 * The endpoint returns one unpaged array, and its `status` filter matches a single value exactly,
 * so a comma-separated list sent there matches nothing. Several statuses are filtered here instead.
 */
export async function fetchPartnerRentalBookingsPage(statuses?: string): Promise<Page<PartnerRentalBooking>> {
  const bookings = await fetchPartnerRentalBookings();
  const wanted = statuses ? new Set(statuses.split(",")) : null;
  return {
    results: wanted
      ? bookings.filter((booking) => booking.status !== undefined && wanted.has(booking.status))
      : bookings,
    next: null,
  };
}

export type RentalPhotoUpload = {
  upload_id: string;
  url: string;
  original_name: string;
};

function rentalPhotoForm(file: File, kind: "ad" | "dispute"): FormData {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("kind", kind);
  return form;
}

export async function uploadPartnerRentalPhoto(file: File): Promise<RentalPhotoUpload> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/rentals/photos", {
      body: { file },
      bodySerializer() {
        return rentalPhotoForm(file, "ad");
      },
    }),
  );
  return data as RentalPhotoUpload;
}

export async function uploadPartnerDisputePhoto(file: File): Promise<{ upload_id: string }> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/rentals/photos", {
      body: { file },
      bodySerializer() {
        return rentalPhotoForm(file, "dispute");
      },
    }),
  );
  return data as { upload_id: string };
}

export async function createPartnerRentalAsset(body: CreateAssetRequest): Promise<RentalAsset> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/rentals/assets", { body }),
  );
  return data as RentalAsset;
}

export async function submitPartnerRentalAsset(assetId: string): Promise<RentalAsset> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/rentals/assets/{asset_id}/{action}", {
      params: { path: { asset_id: assetId, action: "submit" } },
    }),
  );
  return data as RentalAsset;
}

export async function updatePartnerRentalAsset(
  assetId: string,
  body: UpdateAssetRequest,
): Promise<RentalAsset> {
  const data = await request(() =>
    getApiClient().PATCH("/api/v1/partner/rentals/assets/{asset_id}", {
      params: { path: { asset_id: assetId } },
      body,
    }),
  );
  return data as RentalAsset;
}

/** pause = "mark unavailable" (hidden from customers), resume = back on sale. */
export async function partnerRentalAssetAction(
  assetId: string,
  action: "submit" | "pause" | "resume",
): Promise<RentalAsset> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/rentals/assets/{asset_id}/{action}", {
      params: { path: { asset_id: assetId, action } },
    }),
  );
  return data as RentalAsset;
}

export async function deletePartnerRentalAsset(assetId: string): Promise<void> {
  await request(() =>
    getApiClient().DELETE("/api/v1/partner/rentals/assets/{asset_id}", {
      params: { path: { asset_id: assetId } },
    }),
  );
}

export async function deletePartnerRentalAssetMedia(assetId: string, mediaId: string): Promise<void> {
  await request(() =>
    getApiClient().DELETE("/api/v1/partner/rentals/assets/{asset_id}/media/{media_id}", {
      params: { path: { asset_id: assetId, media_id: mediaId } },
    }),
  );
}

export async function partnerRentalBookingAction(
  bookingId: string,
  action: "handover" | "return" | "release-deposit" | "dispute-deposit" | "cancel",
  body?: Partial<PartnerBookingActionRequest> & { photo_ids?: string[] },
): Promise<RentalBooking> {
  const payload = {
    pin: body?.pin ?? "",
    reason: body?.reason ?? "",
    // Always send consume_paise so blank never becomes full-deposit consume on the server.
    consume_paise: body?.consume_paise ?? 0,
    photo_ids: body?.photo_ids ?? [],
  };
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/rentals/bookings/{booking_id}/{action}", {
      params: { path: { booking_id: bookingId, action } },
      body: payload as PartnerBookingActionRequest,
    }),
  );
  return data as RentalBooking;
}

/** Approved A7 variants the partner may list against. */
export function rentalVariantChoices(
  capabilities: readonly PartnerCapability[] | undefined,
): Array<{ id: string; name: string }> {
  if (!capabilities) return [];
  return capabilities
    .filter((cap) => cap.workspace_key === "A7_RENTAL" && cap.status === "APPROVED")
    .map((cap) => ({ id: cap.variant_id, name: cap.variant_name }));
}

export type PickupHours = Schemas["PickupHours"];
export type PickupDayInput = Schemas["PickupDayInputRequest"];
export type RentalTransport = Schemas["RentalTransport"];
export type TransportTrip = Schemas["RentalTransportTripEnum"];

/** The owner's open days and hours, used by every rental item they list. */
export async function fetchPartnerPickupHours(): Promise<PickupHours> {
  return request(() => getApiClient().GET("/api/v1/partner/rentals/pickup-hours"));
}

/** Replace the whole schedule. Days left out are closed. */
export async function savePartnerPickupHours(days: PickupDayInput[]): Promise<PickupHours> {
  return request(() =>
    getApiClient().PUT("/api/v1/partner/rentals/pickup-hours", { body: { days } }),
  );
}

/** Price a delivery request, decline it, or send the item out. */
export async function partnerRentalTransportAction(
  bookingId: string,
  action: "quote" | "decline" | "out-for-delivery",
  body: { amount_paise?: number; trip?: TransportTrip; note?: string } = {},
): Promise<PartnerRentalBooking> {
  return request(() =>
    getApiClient().POST("/api/v1/partner/rentals/bookings/{booking_id}/transport/{action}", {
      params: { path: { booking_id: bookingId, action } },
      // The quote body is the published request shape; decline sends just its note.
      body: {
        amount_paise: body.amount_paise ?? 0,
        trip: body.trip ?? "ONE_WAY",
        note: body.note ?? "",
      },
    }),
  );
}

/** Commission on transport, from the server. 0 means the owner keeps the full price. */
export async function fetchTransportFeePercent(): Promise<number> {
  const data = await request(() => getApiClient().GET("/api/v1/rentals/platform-fee"));
  return data.transport_fee_percent ?? 0;
}
