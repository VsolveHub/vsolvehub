import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";

import type { PartnerRentalAsset, PartnerRentalBooking } from "./model";

export async function fetchPartnerDefaultLocation(): Promise<string> {
  try {
    const data = await request(() => (getApiClient() as any).GET("/api/v1/partner/me/"));
    return ((data as any)?.default_location_text ?? "").trim();
  } catch {
    return "";
  }
}

export async function fetchPartnerRentalAssets(): Promise<PartnerRentalAsset[]> {
  try {
    const data = await request(() => (getApiClient() as any).GET("/api/v1/partner/rentals/assets"));
    return Array.isArray(data) ? (data as PartnerRentalAsset[]) : [];
  } catch {
    return [];
  }
}

export async function fetchPartnerRentalBookings(status?: string): Promise<PartnerRentalBooking[]> {
  try {
    const data = await request(() =>
      (getApiClient() as any).GET("/api/v1/partner/rentals/bookings", {
        params: status && status !== "ALL" ? { query: { status } } : undefined,
      }),
    );
    return Array.isArray(data) ? (data as PartnerRentalBooking[]) : [];
  } catch {
    return [];
  }
}

export async function uploadPartnerRentalPhoto(
  uri: string,
  fileName?: string,
): Promise<{ upload_id: string; url: string }> {
  const formData = new FormData();
  formData.append("file", {
    uri,
    name: fileName || "rental_photo.jpg",
    type: "image/jpeg",
  } as any);
  formData.append("kind", "ad");

  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/rentals/photos", {
      body: formData,
      bodySerializer: () => formData,
    }),
  );
  return data as { upload_id: string; url: string };
}

export async function uploadPartnerDisputePhoto(
  uri: string,
  fileName?: string,
): Promise<{ upload_id: string }> {
  const formData = new FormData();
  formData.append("file", {
    uri,
    name: fileName || "dispute_photo.jpg",
    type: "image/jpeg",
  } as any);
  formData.append("kind", "dispute");

  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/rentals/photos", {
      body: formData,
      bodySerializer: () => formData,
    }),
  );
  return data as { upload_id: string };
}

export async function createPartnerRentalAsset(payload: {
  title: string;
  daily_rate_paise: number;
  deposit_paise: number;
  quantity_available: number;
  location_text?: string;
  description?: string;
  variant_id?: string;
  structured_fields?: Record<string, any>;
  image_urls?: string[];
}): Promise<PartnerRentalAsset> {
  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/rentals/assets", {
      body: payload,
    }),
  );
  return data as PartnerRentalAsset;
}

export async function updatePartnerRentalAsset(
  assetId: string,
  payload: Partial<PartnerRentalAsset>,
): Promise<PartnerRentalAsset> {
  const data = await request(() =>
    (getApiClient() as any).PATCH("/api/v1/partner/rentals/assets/{asset_id}", {
      params: { path: { asset_id: assetId } },
      body: payload,
    }),
  );
  return data as PartnerRentalAsset;
}

export async function submitPartnerRentalAsset(assetId: string): Promise<PartnerRentalAsset> {
  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/rentals/assets/{asset_id}/submit", {
      params: { path: { asset_id: assetId } },
    }),
  );
  return data as PartnerRentalAsset;
}

export async function partnerRentalAssetAction(
  assetId: string,
  action: "submit" | "pause" | "resume",
): Promise<PartnerRentalAsset> {
  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/rentals/assets/{asset_id}/{action}", {
      params: { path: { asset_id: assetId, action } },
    }),
  );
  return data as PartnerRentalAsset;
}

export async function deletePartnerRentalAsset(assetId: string): Promise<void> {
  await request(() =>
    (getApiClient() as any).DELETE("/api/v1/partner/rentals/assets/{asset_id}", {
      params: { path: { asset_id: assetId } },
    }),
  );
}

export async function partnerRentalBookingAction(
  bookingId: string,
  action: "handover" | "return" | "release-deposit" | "dispute-deposit" | "cancel",
  payload?: {
    pin?: string;
    reason?: string;
    consume_paise?: number;
    photo_ids?: string[];
  },
): Promise<any> {
  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/rentals/bookings/{booking_id}/{action}", {
      params: { path: { booking_id: bookingId, action } },
      body: {
        pin: payload?.pin ?? "",
        reason: payload?.reason ?? "",
        consume_paise: payload?.consume_paise ?? 0,
        photo_ids: payload?.photo_ids ?? [],
      },
    }),
  );
  return data;
}

export async function fetchRentalTaxonomy(): Promise<any[]> {
  try {
    const data = await request(() => (getApiClient() as any).GET("/api/v1/rentals/taxonomy"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
