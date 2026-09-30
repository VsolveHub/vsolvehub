"use client";

import { createIdempotencyKey, request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

export type PartnerListing = Schemas["PartnerListing"] & {
  salary_min_paise?: number;
  salary_max_paise?: number;
  salary_period?: string;
  salary_display?: string;
};
export type PartnerApplication = Schemas["Application"];
export type VendorSubscriptionPlan = Schemas["VendorSubscriptionPlan"];
export type VendorSubscription = Schemas["VendorSubscription"];
export type PartnerListingWrite = Schemas["PartnerListingRequest"];
export type ApplicationStatus = Schemas["Application"]["status"];

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

export interface ListingHome {
  active_listings: number;
  pending_moderation: number;
  new_applications: number;
  plan_limit: number | null;
  subscription: null | {
    id: string;
    plan_name: string;
    status: string;
    ends_at: string | null;
  };
}

export interface SchemaProperty {
  type?: string;
  title?: string;
  enum?: string[];
}

export interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

/** Free-form role catalog from `partner/listings/roles` (OpenAPI OBJECT). */
export interface CatalogServiceItem {
  id: string;
  slug: string;
  name: string;
  variants: Array<{
    id: string;
    code: string;
    name: string;
    fulfilment_archetype: string;
    listing_type_schema?: JsonSchemaObject;
    application_schema?: JsonSchemaObject;
  }>;
}

export function fetchListingHome() {
  return request(() => getApiClient().GET("/api/v1/partner/listings/home")) as unknown as Promise<ListingHome>;
}

export const fetchPartnerListingHome = fetchListingHome;

export function fetchPartnerListings() {
  return request(() => getApiClient().GET("/api/v1/partner/listings"));
}

export function fetchPartnerListing(id: string) {
  return request(() =>
    getApiClient().GET("/api/v1/partner/listings/{listing_id}", {
      params: { path: { listing_id: id } },
    }),
  );
}

export const fetchPartnerListingDetail = fetchPartnerListing;

export function createPartnerListing(payload: Omit<PartnerListingWrite, "is_premium"> & { is_premium?: boolean }) {
  return request(() =>
    getApiClient().POST("/api/v1/partner/listings", {
      body: { is_premium: false, ...payload },
    }),
  );
}

export function updatePartnerListing(
  listingId: string,
  payload: Omit<PartnerListingWrite, "is_premium"> & { is_premium?: boolean },
) {
  return request(() =>
    getApiClient().PUT("/api/v1/partner/listings/{listing_id}", {
      params: { path: { listing_id: listingId } },
      body: { is_premium: false, ...payload },
    }),
  );
}

export function runListingAction(
  listingId: string,
  action: "submit" | "publish" | "republish" | "close" | "premium",
  reason = "",
) {
  return request(() =>
    getApiClient().POST("/api/v1/partner/listings/{listing_id}/{action}", {
      params: { path: { listing_id: listingId, action } },
      body: { reason },
    }),
  );
}

export function fetchListingApplications(listingId: string) {
  return request(() =>
    getApiClient().GET("/api/v1/partner/listings/{listing_id}/applications", {
      params: { path: { listing_id: listingId } },
    }),
  );
}

export function revealApplicationContact(applicationId: string) {
  // OpenAPI marks ApplicationStatusRequest as required on this path; reveal-contact ignores body.
  return request(() =>
    getApiClient().POST("/api/v1/partner/listing-applications/{application_id}/{action}", {
      params: { path: { application_id: applicationId, action: "reveal-contact" } },
      body: { status: "SUBMITTED" },
    }),
  );
}

export function updateApplicationStatus(applicationId: string, status: ApplicationStatus) {
  return request(() =>
    getApiClient().POST("/api/v1/partner/listing-applications/{application_id}/{action}", {
      params: { path: { application_id: applicationId, action: "status" } },
      body: { status },
    }),
  );
}

export function fetchSubscriptionPlans() {
  return request(() => getApiClient().GET("/api/v1/partner/listing-subscription-plans"));
}

export function purchaseSubscription(planId: string) {
  return request(() =>
    getApiClient().POST("/api/v1/partner/listing-subscription-plans/{plan_id}/purchase", {
      params: {
        path: { plan_id: planId },
        header: { "Idempotency-Key": createIdempotencyKey() } as never,
      },
    }),
  );
}

export function fetchCareerServices() {
  return request(() => getApiClient().GET("/api/v1/partner/listings/roles")) as unknown as Promise<
    CatalogServiceItem[]
  >;
}

export function reportApplicantApplication(applicationId: string, reason: string, detail = "") {
  return request(() =>
    getApiClient().POST("/api/v1/applications/{application_id}/reports", {
      params: { path: { application_id: applicationId } },
      body: { reason, detail },
    }),
  );
}
