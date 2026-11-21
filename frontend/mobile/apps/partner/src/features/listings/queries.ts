import { createIdempotencyKey, request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { cursorFromNextUrl } from "@vsolve/query/native";

import type {
  ListingHome,
  PartnerApplication,
  PartnerListing,
  VendorSubscription,
  VendorSubscriptionPlan,
} from "./model";

export async function fetchPartnerListings(): Promise<PartnerListing[]> {
  const data = await request(() => getApiClient().GET("/api/v1/partner/listings"));
  return Array.isArray(data) ? (data as PartnerListing[]) : [];
}

export async function fetchPartnerListing(id: string): Promise<PartnerListing> {
  const data = await request(() =>
    getApiClient().GET<PartnerListing>("/api/v1/partner/listings/{listing_id}", {
      params: { path: { listing_id: id } },
    }),
  );
  return data as PartnerListing;
}

export const fetchPartnerListingDetail = fetchPartnerListing;

export function fetchListingHome(): Promise<ListingHome> {
  return request(() =>
    getApiClient().GET<ListingHome>("/api/v1/partner/listings/home"),
  );
}

export const fetchPartnerListingHome = fetchListingHome;

export async function createPartnerListing(payload: {
  title: string;
  employment_type?: string;
  work_mode?: string;
  role_type?: string;
  salary_min_paise?: number;
  salary_max_paise?: number;
  location?: string;
  experience?: string;
  description?: string;
  requirements?: string;
  structured_fields?: Record<string, unknown>;
  [key: string]: unknown;
}): Promise<PartnerListing> {
  const data = await request(() =>
    getApiClient().POST<PartnerListing>("/api/v1/partner/listings", {
      body: {
        is_premium: false,
        ...payload,
      },
    }),
  );
  return data as PartnerListing;
}

export async function updatePartnerListing(
  listingId: string,
  payload: Partial<PartnerListing>,
): Promise<PartnerListing> {
  const data = await request(() =>
    getApiClient().PUT<PartnerListing>("/api/v1/partner/listings/{listing_id}", {
      params: { path: { listing_id: listingId } },
      body: payload,
    }),
  );
  return data as PartnerListing;
}

export async function runListingAction(
  listingId: string,
  action: "submit" | "publish" | "republish" | "close" | "purchase-premium" | "fill",
  reason: string = "",
): Promise<unknown> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/listings/{listing_id}/{action}", {
      params: { path: { listing_id: listingId, action } },
      body: { reason },
    }),
  );
  return data;
}

/** At most this many pages of applicants are read for one job (the website's `fetchAllPages` limit). */
const MAX_APPLICANT_PAGES = 10;

/**
 * Every applicant of one job. The server answers one page at a time (`{ results, next }`), so
 * this follows `next` to the end. It used to check for a plain list, find a page object, and
 * return nothing: the applicants screen and the home's applicant sections were always empty.
 */
export async function fetchListingApplications(listingId: string): Promise<PartnerApplication[]> {
  try {
    const rows: PartnerApplication[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_APPLICANT_PAGES; page += 1) {
      const data = await request(() =>
        getApiClient().GET("/api/v1/partner/listings/{listing_id}/applications", {
          params: { path: { listing_id: listingId }, query: cursor ? { cursor } : {} },
        }),
      );
      rows.push(...(data.results as unknown as PartnerApplication[]));
      cursor = cursorFromNextUrl(data.next);
      if (!cursor) break;
    }
    return rows;
  } catch (err: any) {
    if (err?.status === 404 || err?.statusCode === 404 || err?.message?.includes("404")) {
      return [];
    }
    throw err;
  }
}

export async function updateApplicationStatus(
  applicationId: string,
  status: string,
): Promise<unknown> {
  const data = await request(() =>
    getApiClient().POST(
      "/api/v1/partner/listing-applications/{application_id}/{action}",
      {
        params: { path: { application_id: applicationId, action: "status" } },
        body: { status },
      },
    ),
  );
  return data;
}

export async function revealApplicationContact(applicationId: string): Promise<unknown> {
  const data = await request(() =>
    getApiClient().POST(
      "/api/v1/partner/listing-applications/{application_id}/{action}",
      {
        params: { path: { application_id: applicationId, action: "reveal-contact" } },
        body: { status: "SUBMITTED" },
      },
    ),
  );
  return data;
}

export function fetchSubscriptionPlans(): Promise<VendorSubscriptionPlan[]> {
  return request(() =>
    getApiClient().GET("/api/v1/partner/listing-subscription-plans"),
  ) as Promise<VendorSubscriptionPlan[]>;
}

export function purchaseSubscription(planId: string): Promise<VendorSubscription> {
  const key = createIdempotencyKey();
  return request(() =>
    getApiClient().POST(
      "/api/v1/partner/listing-subscription-plans/{plan_id}/purchase",
      {
        params: {
          path: { plan_id: planId },
          header: { "Idempotency-Key": key } as never,
        },
        headers: {
          "Idempotency-Key": key,
        },
      },
    ),
  ) as Promise<VendorSubscription>;
}

export function fetchCareerServices(): Promise<any[]> {
  return request(() => getApiClient().GET("/api/v1/partner/listings/roles")) as unknown as Promise<any[]>;
}

export function reportApplicantApplication(
  applicationId: string,
  reason: string,
  detail: string = "",
): Promise<unknown> {
  return request(() =>
    getApiClient().POST("/api/v1/applications/{application_id}/reports", {
      params: { path: { application_id: applicationId } },
      body: { reason, detail },
    }),
  );
}
