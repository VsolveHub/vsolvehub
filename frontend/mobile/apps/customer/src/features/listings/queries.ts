import { createIdempotencyKey, request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";

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
  company_name?: string; // backwards compatibility fallback
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

  // Standard A10 Job fields
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
  candidate_name?: string; // fallback
  candidate_phone?: string; // fallback
  candidate_email?: string; // fallback
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
    [key: string]: any;
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

export interface SubmitApplicationPayload {
  name: string;
  phone: string;
  email?: string;
  experience?: string;
  resume_url?: string;
  cover_note?: string;
  skills?: string[];
  findable?: boolean;
  [key: string]: any;
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
  categories: JobCategory[];
  job_types: JobOption[];
  experience_bands: JobOption[];
  qualifications: JobOption[];
  languages: JobOption[];
  benefits: string[];
  shifts: JobOption[];
  work_modes: JobOption[];
  weekly_offs: JobOption[];
  urgencies: JobOption[];
  salary_periods: JobOption[];
  salary_bands: { min_rupees: number; max_rupees: number }[];
  cities: string[];
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

export function withdrawApplication(applicationId: string): Promise<ListingApplication> {
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

export function uploadListingResume(
  listingId: string,
  file: { uri: string; name: string; type: string },
): Promise<{ upload_id: string; resume_url: string; original_name: string }> {
  const formData = new FormData();
  formData.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.type || "application/pdf",
  } as any);

  return request(() =>
    (getApiClient() as any).POST("/api/v1/listings/{listing_id}/resume-uploads", {
      params: { path: { listing_id: listingId } },
      body: formData,
      bodySerializer: () => formData,
    }),
  );
}

export function reportListing(listingId: string, reason: string, detail: string = ""): Promise<any> {
  return request(() =>
    (getApiClient() as any).POST("/api/v1/listings/{listing_id}/reports", {
      params: { path: { listing_id: listingId } },
      body: { reason, detail },
    }),
  );
}

export function fetchListingFilters(): Promise<any> {
  return request(() => (getApiClient() as any).GET("/api/v1/listings/filters"));
}

export function fetchJobOptions(): Promise<JobOptions> {
  return request(() => (getApiClient() as any).GET("/api/v1/jobs/options"));
}

export function fetchJobCategories(): Promise<any> {
  return request(() => (getApiClient() as any).GET("/api/v1/categories/"));
}
