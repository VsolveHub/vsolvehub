import { request, type Schemas } from "@vsolve/api-client";
import type { Page } from "@vsolve/query";
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

/** The screen's filter chips, as the server filters they mean. Exported for tests. */
export function listingFilterQuery(filter: string): { status?: string; moderation_status?: string } {
  switch (filter) {
    case "PENDING":
      return { moderation_status: "PENDING" };
    case "ACTIVE":
      return { status: "PUBLISHED" };
    case "REMOVED":
      return { status: "REMOVED" };
    case "DRAFT":
      return { status: "DRAFT" };
    case "CLOSED":
      return { status: "CLOSED,EXPIRED" };
    default:
      return {};
  }
}

export function fetchOpsListingsPage(
  cursor: string | undefined,
  filter: string,
  q: string,
): Promise<Page<AdminListing>> {
  return request(() =>
    getApiClient().GET("/api/v1/ops/listings", {
      params: {
        query: {
          ...listingFilterQuery(filter),
          ...(q ? { q } : {}),
          ...(cursor ? { cursor } : {}),
        },
      },
    }),
  ) as Promise<Page<AdminListing>>;
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
