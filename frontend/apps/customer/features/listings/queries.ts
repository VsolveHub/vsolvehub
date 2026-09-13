"use client";

import { createIdempotencyKey, request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

export type Listing = Schemas["ListingSummary"];
export type ListingDetail = Schemas["ListingDetail"];
export type ListingApplication = Schemas["Application"];
export type CatalogCategory = Schemas["Category"];
export type SubmitApplicationPayload = Schemas["SubmitApplicationRequest"];

/** A10 structured_fields is a free-form JSON object on the wire. */
export type ListingFields = Record<string, string | number | boolean | undefined>;

export function listingFields(value: unknown): ListingFields {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ListingFields)
    : {};
}

export function snapshotFields(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry == null) continue;
    out[key] = String(entry);
  }
  return out;
}

export function fetchListings(filters: { q?: string; location?: string; service?: string } = {}) {
  return request(() =>
    getApiClient().GET("/api/v1/listings", {
      params: {
        query: {
          q: filters.q,
          location: filters.location,
          service: filters.service,
        },
      },
    }),
  );
}

export function fetchListing(id: string) {
  return request(() =>
    getApiClient().GET("/api/v1/listings/{listing_id}", {
      params: { path: { listing_id: id } },
    }),
  );
}

export function fetchMyApplications() {
  return request(() => getApiClient().GET("/api/v1/my/listing-applications"));
}

export function withdrawApplication(applicationId: string) {
  return request(() =>
    getApiClient().POST("/api/v1/my/listing-applications/{application_id}/withdraw", {
      params: { path: { application_id: applicationId } },
    }),
  );
}

export function submitListingApplication(listingId: string, payload: SubmitApplicationPayload) {
  return request(() =>
    getApiClient().POST("/api/v1/listings/{listing_id}/applications", {
      params: {
        path: { listing_id: listingId },
        // Contract gap: view requires Idempotency-Key; spectacular does not publish it yet.
        header: { "Idempotency-Key": createIdempotencyKey() } as never,
      },
      body: payload,
    }),
  );
}

export function reportListing(listingId: string, reason: string, detail = "") {
  return request(() =>
    getApiClient().POST("/api/v1/listings/{listing_id}/reports", {
      params: { path: { listing_id: listingId } },
      body: { reason, detail },
    }),
  );
}

export function fetchJobCategories() {
  return request(() => getApiClient().GET("/api/v1/categories/"));
}
