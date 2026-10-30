"use client";

import { createIdempotencyKey, request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

const api = () => getApiClient() as any;

export type ListingPay = {
  salary_min_paise?: number;
  salary_max_paise?: number;
  salary_period?: string;
  salary_display?: string;
};

export interface Interview {
  id: string;
  scheduled_date: string;
  start_time: string;
  mode: "IN_PERSON" | "PHONE" | "VIDEO";
  mode_label: string;
  location_text: string;
  note: string;
  status:
    | "PROPOSED"
    | "ACCEPTED"
    | "RESCHEDULE_REQUESTED"
    | "DECLINED"
    | "CANCELLED"
    | "COMPLETED";
  status_label: string;
  candidate_note: string;
  responded_at?: string | null;
  created_at: string;
}

export interface Listing extends ListingPay {
  id: string;
  slug?: string;
  poster_name?: string;
  company_name?: string;
  partner?: {
    id?: string;
    company_name?: string;
    display_name?: string;
    full_name?: string;
    phone_number?: string;
  };
  service_name?: string;
  variant_name?: string;
  title: string;
  structured_fields?: Record<string, any>;
  status?: string;
  moderation_status?: string;
  public_state?: string;
  location_text?: string;
  location?: string;
  is_premium?: boolean;
  published_at?: string;
  expires_at?: string;
  application_count?: number;

  role_template?: string;
  job_category?: string;
  vacancies?: number;
  job_type?: string;
  experience_band?: string;
  required_skills?: string[];
  preferred_skills?: string[];
  responsibilities?: string[];
  benefits?: string[];
  languages?: string[];
  min_qualification?: string;
  shift?: string;
  work_mode?: string;
  timing_start?: string;
  timing_end?: string;
  weekly_off?: string;
  urgency?: string;
  city?: string;
  area?: string;
}

export interface ListingDetail extends Listing {
  description?: string;
  contact_masked?: {
    phone?: string;
    email?: string;
  };
  contact_phone?: string;
  contact_email?: string;
  listing_type_schema?: Record<string, any>;
  application_schema?: Record<string, any>;
}

export interface ListingApplication {
  id: string;
  listing?: string;
  listing_id?: string;
  listing_title?: string;
  listing_slug?: string;
  status: string;
  applicant_name?: string;
  applicant_phone?: string;
  applicant_email?: string;
  candidate_name?: string;
  candidate_phone?: string;
  candidate_email?: string;
  cover_note?: string;
  resume_url?: string;
  employer_name?: string;
  employer_phone?: string;
  contact_revealed_at?: string | null;
  withdrawn_at?: string | null;
  created_at: string;
  updated_at?: string;
  interview?: Interview | null;
  applicant_snapshot?: {
    name?: string;
    phone?: string;
    email?: string;
    experience?: string;
    skills?: string[];
    findable?: boolean;
    [key: string]: unknown;
  };
  attachments?: {
    id: string;
    file_url: string;
    file_name: string;
    created_at: string;
  }[];
  status_events?: {
    id: string;
    from_status: string;
    to_status: string;
    kind: string;
    note: string;
    created_at: string;
  }[];
}

export type CatalogCategory = Schemas["Category"];
export interface SubmitApplicationPayload {
  name: string;
  phone: string;
  email?: string;
  experience?: string;
  resume_url?: string;
  cover_note?: string;
  skills?: string[];
  findable?: boolean;
  [key: string]: unknown;
}

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
  } = {},
): Promise<Listing[]> {
  return request(() =>
    api().GET("/api/v1/listings", {
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
  ) as unknown as Promise<Listing[]>;
}


export function uploadListingResume(listingId: string, file: File) {
  return request(() =>
    api().POST("/api/v1/listings/{listing_id}/resume-uploads", {
      params: { path: { listing_id: listingId } },
      body: { file },
      bodySerializer(body: any) {
        const data = new FormData();
        const picked = (body as { file?: Blob }).file;
        if (picked) data.append("file", picked);
        return data;
      },
    }),
  );
}

/** `key` is the page slug; an old link's listing id works too. */
export function fetchListing(key: string): Promise<ListingDetail> {
  return request(() =>
    api().GET("/api/v1/listings/{key}", {
      params: { path: { key } },
    }),
  ) as unknown as Promise<ListingDetail>;
}

export function fetchMyApplications(): Promise<ListingApplication[]> {
  return request(() => api().GET("/api/v1/my/listing-applications")) as unknown as Promise<ListingApplication[]>;
}

export function withdrawApplication(applicationId: string): Promise<ListingApplication> {
  return request(() =>
    api().POST("/api/v1/my/listing-applications/{application_id}/withdraw", {
      params: { path: { application_id: applicationId } },
    }),
  ) as unknown as Promise<ListingApplication>;
}

export function submitListingApplication(
  listingId: string,
  payload: SubmitApplicationPayload,
): Promise<ListingApplication> {
  return request(() =>
    api().POST("/api/v1/listings/{listing_id}/applications", {
      params: {
        path: { listing_id: listingId },
        // Contract gap: view requires Idempotency-Key; spectacular does not publish it yet.
        header: { "Idempotency-Key": createIdempotencyKey() } as never,
      },
      body: payload,
    }),
  ) as unknown as Promise<ListingApplication>;
}

export function reportListing(listingId: string, reason: string, detail = "") {
  return request(() =>
    api().POST("/api/v1/listings/{listing_id}/reports", {
      params: { path: { listing_id: listingId } },
      body: { reason, detail },
    }),
  );
}

export function fetchJobCategories(): Promise<CatalogCategory[]> {
  return request(() => api().GET("/api/v1/categories/")) as unknown as Promise<CatalogCategory[]>;
}

export function fetchListingFilters(): Promise<any> {
  return request(() => api().GET("/api/v1/listings/filters"));
}

export interface JobOption {
  value: string;
  label: string;
}

export interface JobRoleTemplate {
  id: string;
  name: string;
  skills: string[];
  responsibilities: string[];
  job_type: string;
  shift: string;
  work_mode: string;
  salary_min_rupees: number;
  salary_max_rupees: number;
}

export interface JobCategory {
  name: string;
  roles: JobRoleTemplate[];
}

export interface JobOptions {
  languages: JobOption[];
  job_types: JobOption[];
  experience_bands: JobOption[];
  shifts: JobOption[];
  weekly_offs: JobOption[];
  work_modes: JobOption[];
  qualifications: JobOption[];
  urgencies: JobOption[];
  categories: JobCategory[];
  cities: string[];
  [key: string]: unknown;
}

/** Labels for job values ("FULL_TIME" → "Full time"), shared with the employer form. */
export function fetchJobOptions(): Promise<JobOptions> {
  return request(() => api().GET("/api/v1/jobs/options")) as unknown as Promise<JobOptions>;
}
