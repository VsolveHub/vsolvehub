import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";

import type {
  CreateAssetRequest,
  PartnerBookingActionRequest,
  PartnerRentalAsset,
  PartnerRentalBooking,
  TaxonomySubcategory,
  UpdateAssetRequest,
} from "./model";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestParams {
  query?: Record<string, string | number | boolean | undefined>;
  path?: Record<string, string>;
}

interface RequestInitOptions {
  params?: RequestParams;
  body?: unknown;
  bodySerializer?: (body: unknown) => unknown;
}

type ApiOperation<T> = (
  path: string,
  init?: RequestInitOptions,
) => Promise<{ data?: T; error?: unknown; response: Response }>;

function getClientMethod<T>(client: object, method: HttpMethod): ApiOperation<T> {
  const methodFn = Reflect.get(client, method) as ApiOperation<T>;
  return methodFn;
}

export function callRentalApi<T>(
  method: HttpMethod,
  path: string,
  options?: RequestInitOptions,
): Promise<T> {
  const client = getApiClient();
  const methodFn = getClientMethod<T>(client, method);
  return request(() => Reflect.apply(methodFn, client, [path, options]) as Promise<{
    data?: T;
    error?: unknown;
    response: Response;
  }>);
}

interface ReactNativeFile {
  uri: string;
  name: string;
  type: string;
}

declare global {
  interface FormData {
    append(name: string, value: string | Blob | ReactNativeFile): void;
  }
}

export async function fetchPartnerDefaultLocation(): Promise<string> {
  try {
    const data = await callRentalApi<{ default_location_text?: string }>("GET", "/api/v1/partner/me/");
    return (data?.default_location_text ?? "").trim();
  } catch {
    return "";
  }
}

export async function fetchPartnerRentalAssets(): Promise<PartnerRentalAsset[]> {
  const data = await callRentalApi<PartnerRentalAsset[]>("GET", "/api/v1/partner/rentals/assets");
  return Array.isArray(data) ? data : [];
}

export async function fetchPartnerRentalBookings(status?: string): Promise<PartnerRentalBooking[]> {
  const data = await callRentalApi<PartnerRentalBooking[]>("GET", "/api/v1/partner/rentals/bookings", {
    params: status && status !== "ALL" ? { query: { status } } : undefined,
  });
  return Array.isArray(data) ? data : [];
}

export async function uploadPartnerRentalPhoto(
  uri: string,
  fileName?: string,
): Promise<{ upload_id: string; url: string }> {
  const file: ReactNativeFile = {
    uri,
    name: fileName || "rental_photo.jpg",
    type: "image/jpeg",
  };
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kind", "ad");

  const data = await callRentalApi<{ upload_id: string; url: string }>(
    "POST",
    "/api/v1/partner/rentals/photos",
    {
      body: formData,
      bodySerializer: () => formData,
    },
  );
  return data;
}

export async function uploadPartnerDisputePhoto(
  uri: string,
  fileName?: string,
): Promise<{ upload_id: string }> {
  const file: ReactNativeFile = {
    uri,
    name: fileName || "dispute_photo.jpg",
    type: "image/jpeg",
  };
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kind", "dispute");

  const data = await callRentalApi<{ upload_id: string }>(
    "POST",
    "/api/v1/partner/rentals/photos",
    {
      body: formData,
      bodySerializer: () => formData,
    },
  );
  return data;
}

export async function createPartnerRentalAsset(
  payload: CreateAssetRequest,
): Promise<PartnerRentalAsset> {
  const data = await callRentalApi<PartnerRentalAsset>(
    "POST",
    "/api/v1/partner/rentals/assets",
    {
      body: payload,
    },
  );
  return data;
}

export async function updatePartnerRentalAsset(
  assetId: string,
  payload: UpdateAssetRequest,
): Promise<PartnerRentalAsset> {
  const data = await callRentalApi<PartnerRentalAsset>(
    "PATCH",
    "/api/v1/partner/rentals/assets/{asset_id}",
    {
      params: { path: { asset_id: assetId } },
      body: payload,
    },
  );
  return data;
}

export async function submitPartnerRentalAsset(assetId: string): Promise<PartnerRentalAsset> {
  const data = await callRentalApi<PartnerRentalAsset>(
    "POST",
    "/api/v1/partner/rentals/assets/{asset_id}/submit",
    {
      params: { path: { asset_id: assetId } },
    },
  );
  return data;
}

export async function partnerRentalAssetAction(
  assetId: string,
  action: "submit" | "pause" | "resume",
): Promise<PartnerRentalAsset> {
  const data = await callRentalApi<PartnerRentalAsset>(
    "POST",
    "/api/v1/partner/rentals/assets/{asset_id}/{action}",
    {
      params: { path: { asset_id: assetId, action } },
    },
  );
  return data;
}

export async function deletePartnerRentalAsset(assetId: string): Promise<void> {
  await callRentalApi<void>("DELETE", "/api/v1/partner/rentals/assets/{asset_id}", {
    params: { path: { asset_id: assetId } },
  });
}

export async function deletePartnerRentalAssetMedia(
  assetId: string,
  mediaId: string,
): Promise<void> {
  await callRentalApi<void>(
    "DELETE",
    "/api/v1/partner/rentals/assets/{asset_id}/media/{media_id}",
    {
      params: { path: { asset_id: assetId, media_id: mediaId } },
    },
  );
}

export async function partnerRentalBookingAction(
  bookingId: string,
  action: "handover" | "return" | "release-deposit" | "dispute-deposit" | "cancel",
  payload?: PartnerBookingActionRequest,
): Promise<PartnerRentalBooking> {
  const data = await callRentalApi<PartnerRentalBooking>(
    "POST",
    "/api/v1/partner/rentals/bookings/{booking_id}/{action}",
    {
      params: { path: { booking_id: bookingId, action } },
      body: {
        pin: payload?.pin ?? "",
        reason: payload?.reason ?? "",
        consume_paise: payload?.consume_paise ?? 0,
        photo_ids: payload?.photo_ids ?? [],
      },
    },
  );
  return data;
}

export async function fetchRentalTaxonomy(): Promise<TaxonomySubcategory[]> {
  const data = await callRentalApi<TaxonomySubcategory[]>("GET", "/api/v1/rentals/taxonomy");
  return Array.isArray(data) ? data : [];
}
