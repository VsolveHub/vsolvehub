import { request, type Schemas } from "@vsolve/api-client";
import { getApiClient } from "@/lib/api/browser";

export type AdminListing = Schemas["PartnerListing"] & {
  salary_min_paise?: number;
  salary_max_paise?: number;
  salary_period?: string;
  salary_display?: string;
};

export function listingFields(
  value: unknown,
): Record<string, string | number | boolean | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, string | number | boolean | undefined>)
    : {};
}

export async function fetchOpsListings(): Promise<AdminListing[]> {
  const data = await request(() => getApiClient().GET("/api/v1/ops/listings"));
  return Array.isArray(data) ? data : [];
}

export async function moderateOpsListing(
  listingId: string,
  approved: boolean,
  reason: string,
): Promise<void> {
  await request(() =>
    getApiClient().POST("/api/v1/ops/listings/{listing_id}/moderate", {
      params: { path: { listing_id: listingId } },
      body: { approved, reason },
    }),
  );
}

export async function removeOpsListing(
  listingId: string,
  reason: string,
): Promise<void> {
  await request(() =>
    getApiClient().POST("/api/v1/ops/listings/{listing_id}/remove", {
      params: { path: { listing_id: listingId } },
      body: { reason },
    }),
  );
}

export async function reinstateOpsListing(
  listingId: string,
  reason: string,
): Promise<void> {
  await request(() =>
    getApiClient().POST("/api/v1/ops/listings/{listing_id}/reinstate", {
      params: { path: { listing_id: listingId } },
      body: { reason },
    }),
  );
}
