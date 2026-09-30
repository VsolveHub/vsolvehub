"use client";

import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

export type RentalAsset = Schemas["RentalAsset"];
export type RentalBooking = Schemas["RentalBooking"];
export type CreateAssetRequest = Schemas["CreateAssetRequest"];
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

export async function fetchPartnerRentalAssets(): Promise<RentalAsset[]> {
  const data = await request(() => getApiClient().GET("/api/v1/partner/rentals/assets"));
  return Array.isArray(data) ? data : [];
}

export async function fetchPartnerRentalBookings(status?: string): Promise<RentalBooking[]> {
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

export async function uploadPartnerRentalPhoto(file: File): Promise<RentalPhotoUpload> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/rentals/photos", {
      body: { file },
      bodySerializer(body) {
        const form = new FormData();
        const blob = body && typeof body === "object" && "file" in body ? (body as { file?: Blob }).file : undefined;
        if (blob) form.append("file", blob, file.name);
        return form;
      },
    }),
  );
  return data as RentalPhotoUpload;
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

export async function partnerRentalBookingAction(
  bookingId: string,
  action: "handover" | "return" | "release-deposit" | "dispute-deposit" | "cancel",
  body?: Partial<PartnerBookingActionRequest>,
): Promise<RentalBooking> {
  const payload: PartnerBookingActionRequest = {
    pin: body?.pin ?? "",
    reason: body?.reason ?? "",
    // Always send consume_paise so blank never becomes full-deposit consume on the server.
    consume_paise: body?.consume_paise ?? 0,
  };
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/rentals/bookings/{booking_id}/{action}", {
      params: { path: { booking_id: bookingId, action } },
      body: payload,
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
