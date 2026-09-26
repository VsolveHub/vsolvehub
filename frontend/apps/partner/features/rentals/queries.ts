"use client";

import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

export type RentalAsset = Schemas["RentalAsset"];
export type RentalBooking = Schemas["RentalBooking"];
export type CreateAssetRequest = Schemas["CreateAssetRequest"] & {
  structured_fields?: Record<string, unknown>;
  image_urls?: string[];
  media?: Array<{ url?: string; image_url?: string; caption?: string }>;
};
export type PartnerCapability = Schemas["PartnerCapability"];

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
  const client = getApiClient();
  const { data, error } = await client.GET("/api/v1/rentals/taxonomy" as never);
  if (error) {
    throw new Error(
      typeof error === "object" && error && "detail" in error
        ? String((error as { detail: unknown }).detail)
        : "Failed to load rental taxonomy",
    );
  }
  return Array.isArray(data) ? (data as RentalTaxonomySubcategory[]) : [];
}

export async function fetchPartnerRentalAssets(): Promise<RentalAsset[]> {
  const data = await request(() => getApiClient().GET("/api/v1/partner/rentals/assets"));
  return Array.isArray(data) ? data : [];
}

export async function fetchPartnerRentalBookings(): Promise<RentalBooking[]> {
  const data = await request(() => getApiClient().GET("/api/v1/partner/rentals/bookings"));
  return Array.isArray(data) ? data : [];
}

export type RentalPhotoUpload = {
  upload_id: string;
  url: string;
  original_name: string;
};

export async function uploadPartnerRentalPhoto(file: File): Promise<RentalPhotoUpload> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/rentals/photos" as never, {
      body: { file },
      bodySerializer(body: { file?: Blob }) {
        const form = new FormData();
        if (body.file) form.append("file", body.file, file.name);
        return form;
      },
    } as never),
  );
  return data as RentalPhotoUpload;
}

export async function createPartnerRentalAsset(
  body: CreateAssetRequest,
): Promise<RentalAsset> {
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
  action: "handover" | "return" | "release-deposit",
): Promise<RentalBooking> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/rentals/bookings/{booking_id}/{action}", {
      params: { path: { booking_id: bookingId, action } },
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
