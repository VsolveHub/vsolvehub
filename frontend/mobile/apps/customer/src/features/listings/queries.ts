import { createIdempotencyKey, request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";

export type ListingPay = {
  salary_min_paise?: number;
  salary_max_paise?: number;
  salary_period?: string;
  salary_display?: string;
};

export interface Listing extends ListingPay {
  id: string;
  title: string;
  slug?: string;
  company_name?: string;
  location?: string;
  location_text?: string;
  work_mode?: string;
  employment_type?: string;
  role_type?: string;
  experience?: string;
  created_at?: string;
  expires_at?: string;
  status?: string;
  category?: {
    id: string;
    name: string;
    slug?: string;
  };
  partner?: {
    id?: string;
    company_name?: string;
    display_name?: string;
    full_name?: string;
    phone_number?: string;
  };
}

export interface ListingDetail extends Listing {
  description?: string;
  requirements?: string;
  responsibilities?: string;
  benefits?: string;
  structured_fields?: Record<string, any>;
  contact_email?: string;
  contact_phone?: string;
}

export interface ListingApplication {
  id: string;
  listing_id?: string;
  listing?: Listing;
  status: string;
  created_at: string;
  candidate_name?: string;
  candidate_email?: string;
  candidate_phone?: string;
  experience?: string;
  resume_url?: string;
  cover_note?: string;
  skills?: string[];
}

export interface SubmitApplicationPayload {
  name?: string;
  phone?: string;
  email?: string;
  experience?: string;
  resume_url?: string;
  cover_note?: string;
  skills?: string[];
  applicant_snapshot?: {
    skills?: string[];
    findable?: boolean;
    [key: string]: any;
  };
  [key: string]: any;
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
  } = {},
): Promise<Listing[]> {
  return request(() =>
    (getApiClient() as any).GET("/api/v1/listings", {
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
        },
      },
    }),
  );
}

/** `key` is the page slug; an old link's listing id works too. */
export function fetchListing(key: string): Promise<ListingDetail> {
  return request(() =>
    (getApiClient() as any).GET("/api/v1/listings/{key}", {
      params: { path: { key } },
    }),
  );
}

export function fetchMyApplications(): Promise<ListingApplication[]> {
  return request(() => (getApiClient() as any).GET("/api/v1/my/listing-applications"));
}

export function withdrawApplication(applicationId: string): Promise<any> {
  return request(() =>
    (getApiClient() as any).POST("/api/v1/my/listing-applications/{application_id}/withdraw", {
      params: { path: { application_id: applicationId } },
    }),
  );
}

export function submitListingApplication(
  listingId: string,
  payload: SubmitApplicationPayload,
): Promise<ListingApplication> {
  return request(() =>
    (getApiClient() as any).POST("/api/v1/listings/{listing_id}/applications", {
      params: {
        path: { listing_id: listingId },
        header: { "Idempotency-Key": createIdempotencyKey() } as never,
      },
      body: payload,
    }),
  );
}

export function fetchListingFilters(): Promise<any> {
  return request(() => (getApiClient() as any).GET("/api/v1/listings/filters"));
}

