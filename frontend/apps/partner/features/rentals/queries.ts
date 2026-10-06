"use client";

import { request, type Schemas } from "@vsolve/api-client";

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
