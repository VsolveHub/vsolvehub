import { createIdempotencyKey, request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";

import type {
  ListingHome,
  PartnerApplication,
  PartnerListing,
  VendorSubscription,
  VendorSubscriptionPlan,
} from "./model";

export async function fetchPartnerListings(): Promise<PartnerListing[]> {
  const data = await request(() => (getApiClient() as any).GET("/api/v1/partner/listings"));
  return Array.isArray(data) ? (data as PartnerListing[]) : [];
}

export async function fetchPartnerListing(id: string): Promise<PartnerListing> {
  const data = await request(() =>
    (getApiClient() as any).GET("/api/v1/partner/listings/{listing_id}", {
      params: { path: { listing_id: id } },
    }),
  );
  return data as PartnerListing;
}

export const fetchPartnerListingDetail = fetchPartnerListing;

export function fetchListingHome(): Promise<ListingHome> {
  return request(() =>
    (getApiClient() as any).GET("/api/v1/partner/listings/home"),
  ) as Promise<ListingHome>;
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
  structured_fields?: Record<string, any>;
  [key: string]: any;
}): Promise<PartnerListing> {
  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/listings", {
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
    (getApiClient() as any).PUT("/api/v1/partner/listings/{listing_id}", {
      params: { path: { listing_id: listingId } },
      body: payload,
    }),
  );
  return data as PartnerListing;
}

export async function runListingAction(
  listingId: string,
  action: "submit" | "publish" | "republish" | "close" | "purchase-premium",
  reason: string = "",
): Promise<any> {
  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/listings/{listing_id}/{action}", {
      params: { path: { listing_id: listingId, action } },
      body: { reason },
    }),
  );
  return data;
}

export async function fetchListingApplications(listingId: string): Promise<PartnerApplication[]> {
  const data = await request(() =>
    (getApiClient() as any).GET("/api/v1/partner/listings/{listing_id}/applications", {
      params: { path: { listing_id: listingId } },
    }),
  );
  return Array.isArray(data) ? (data as PartnerApplication[]) : [];
}

export async function updateApplicationStatus(
  applicationId: string,
  status: string,
): Promise<any> {
  const data = await request(() =>
    (getApiClient() as any).POST(
      "/api/v1/partner/listing-applications/{application_id}/{action}",
      {
        params: { path: { application_id: applicationId, action: "status" } },
        body: { status },
      },
    ),
  );
  return data;
}

export async function revealApplicationContact(applicationId: string): Promise<any> {
  const data = await request(() =>
    (getApiClient() as any).POST(
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
    (getApiClient() as any).GET("/api/v1/partner/listing-subscription-plans"),
  );
}

export function purchaseSubscription(planId: string): Promise<VendorSubscription> {
  return request(() =>
    (getApiClient() as any).POST(
      "/api/v1/partner/listing-subscription-plans/{plan_id}/purchase",
      {
        params: { path: { plan_id: planId } },
        header: { "Idempotency-Key": createIdempotencyKey() } as never,
      },
    ),
  );
}

export function fetchCareerServices(): Promise<any[]> {
  return request(() => (getApiClient() as any).GET("/api/v1/partner/listings/roles"));
}

export function reportApplicantApplication(
  applicationId: string,
  reason: string,
  detail: string = "",
): Promise<any> {
  return request(() =>
    (getApiClient() as any).POST("/api/v1/applications/{application_id}/reports", {
      params: { path: { application_id: applicationId } },
      body: { reason, detail },
    }),
  );
}
