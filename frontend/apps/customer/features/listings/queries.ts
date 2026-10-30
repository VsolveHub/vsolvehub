"use client";

import { createIdempotencyKey, request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

export type ListingPay = {
  salary_min_paise?: number;
  salary_max_paise?: number;
  salary_period?: string;
  salary_display?: string;
};

export type Listing = Schemas["ListingSummary"] & ListingPay;
export type ListingDetail = Schemas["ListingDetail"] & ListingPay;
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

export function fetchListings(
  filters: {
    q?: string;
    location?: string;
    service?: string;
    sort?: string;
    employment_type?: string;
    work_mode?: string;
    experience?: string;
    salary_band?: string;
    min_salary?: number;
    max_salary?: number;
    limit?: number;
    offset?: number;
  } = {},
) {
  return request(() =>
    getApiClient().GET("/api/v1/listings", {
      params: {
        query: {
          q: filters.q,
          location: filters.location,
          service: filters.service,
          sort: filters.sort,
          employment_type: filters.employment_type,
          work_mode: filters.work_mode,
          experience: filters.experience,
          salary_band: filters.salary_band,
          min_salary: filters.min_salary,
          max_salary: filters.max_salary,
          limit: filters.limit,
          offset: filters.offset,
        },
      },
    }),
  );
}


export function uploadListingResume(listingId: string, file: File) {
  return request(() =>
    getApiClient().POST("/api/v1/listings/{listing_id}/resume-uploads", {
      params: { path: { listing_id: listingId } },
      body: { file },
      bodySerializer(body) {
        const data = new FormData();
        const picked = (body as { file?: Blob }).file;
        if (picked) data.append("file", picked);
        return data;
      },
    }),
  );
}

/** `key` is the page slug; an old link's listing id works too. */
export function fetchListing(key: string) {
  return request(() =>
    getApiClient().GET("/api/v1/listings/{key}", {
      params: { path: { key } },
    }),
  );
}

/** "My applications" tabs as the application states the server filters on. */
export const APPLICATION_TAB_STATUSES: Record<string, string> = {
  ALL: "",
  ACTIVE: "SUBMITTED,UNDER_REVIEW,SHORTLISTED,CONTACTED",
  SHORTLISTED: "SHORTLISTED",
  CLOSED: "REJECTED,WITHDRAWN,EXPIRED",
};

export function fetchMyApplicationsPage(
  cursor?: string,
  filters: { listing?: string; status?: string } = {},
) {
  return request(() =>
    getApiClient().GET("/api/v1/my/listing-applications", {
      params: {
        query: {
          ...(cursor ? { cursor } : {}),
          ...(filters.listing ? { listing: filters.listing } : {}),
          ...(filters.status ? { status: filters.status } : {}),
        },
      },
    }),
  );
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

export function fetchListingFilters() {
  return request(() => getApiClient().GET("/api/v1/listings/filters"));
}

export type JobOptions = Schemas["JobOptions"];

/** Labels for job values ("FULL_TIME" → "Full time"), shared with the employer form. */
export function fetchJobOptions(): Promise<JobOptions> {
  return request(() => getApiClient().GET("/api/v1/jobs/options"));
}
