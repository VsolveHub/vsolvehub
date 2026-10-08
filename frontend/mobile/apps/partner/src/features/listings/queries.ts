import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";

import type { PartnerApplication, PartnerListing } from "./model";

export async function fetchPartnerListings(): Promise<PartnerListing[]> {
  try {
    const data = await request(() => (getApiClient() as any).GET("/api/v1/partner/listings"));
    return Array.isArray(data) ? (data as PartnerListing[]) : [];
  } catch {
    return [];
  }
}

export async function fetchPartnerListing(id: string): Promise<PartnerListing> {
  const data = await request(() =>
    (getApiClient() as any).GET("/api/v1/partner/listings/{listing_id}", {
      params: { path: { listing_id: id } },
    }),
  );
  return data as PartnerListing;
}

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
  action: "submit" | "publish" | "republish" | "close",
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
  try {
    const data = await request(() =>
      (getApiClient() as any).GET("/api/v1/partner/listings/{listing_id}/applications", {
        params: { path: { listing_id: listingId } },
      }),
    );
    return Array.isArray(data) ? (data as PartnerApplication[]) : [];
  } catch {
    return [];
  }
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
