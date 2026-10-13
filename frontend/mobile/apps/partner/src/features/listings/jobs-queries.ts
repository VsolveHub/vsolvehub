import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import type { CandidateMatch, PartnerListing } from "./model";

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

export interface JobCreate {
  role_template_id?: string | null;
  title: string;
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
  timing_start?: string | null;
  timing_end?: string | null;
  weekly_off?: string;
  urgency?: string;
  city?: string;
  area?: string;
  salary_min_paise?: number;
  salary_max_paise?: number;
  salary_period?: string;
  description?: string;
  contact_phone?: string;
  contact_email?: string;
  publish?: boolean;
}

export type JobUpdate = Partial<JobCreate> & {
  regenerate_description?: boolean;
};

export function fetchJobOptions(): Promise<JobOptions> {
  return request(() => (getApiClient() as any).GET("/api/v1/jobs/options"));
}

export async function postJob(body: JobCreate): Promise<PartnerListing> {
  return (await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/jobs", { body }),
  )) as PartnerListing;
}

export async function updateJob(id: string, body: JobUpdate): Promise<PartnerListing> {
  return (await request(() =>
    (getApiClient() as any).PATCH("/api/v1/partner/jobs/{listing_id}", {
      params: { path: { listing_id: id } },
      body,
    }),
  )) as PartnerListing;
}

export async function publishJob(id: string): Promise<PartnerListing> {
  return (await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/jobs/{listing_id}/publish", {
      params: { path: { listing_id: id } },
    }),
  )) as PartnerListing;
}

export async function duplicateJob(id: string): Promise<PartnerListing> {
  return (await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/jobs/{listing_id}/duplicate", {
      params: { path: { listing_id: id } },
    }),
  )) as PartnerListing;
}

export function optionLabel(
  options: readonly JobOption[] | undefined,
  value: string | undefined | null,
): string {
  if (!value) return "";
  return options?.find((option) => option.value === value)?.label ?? value;
}

export function hhmm(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "";
}

export function rupeesLabel(rupees: number): string {
  return `₹${rupees.toLocaleString("en-IN")}`;
}

export function fetchJobMatches(id: string): Promise<CandidateMatch[]> {
  return request(() =>
    (getApiClient() as any).GET("/api/v1/partner/jobs/{listing_id}/matches", {
      params: { path: { listing_id: id } },
    }),
  );
}

export function inviteToApply(listingId: string, profileId: string): Promise<any> {
  return request(() =>
    (getApiClient() as any).POST("/api/v1/partner/jobs/{listing_id}/invite/{profile_id}", {
      params: { path: { listing_id: listingId, profile_id: profileId } },
    }),
  );
}

export type InterviewMode = "IN_PERSON" | "PHONE" | "VIDEO";

export const INTERVIEW_MODES: readonly { value: InterviewMode; label: string }[] = [
  { value: "IN_PERSON", label: "In person" },
  { value: "PHONE", label: "Phone call" },
  { value: "VIDEO", label: "Video call" },
];

export function proposeInterview(
  applicationId: string,
  body: {
    scheduled_date: string;
    start_time: string;
    mode: InterviewMode;
    location_text?: string;
    note?: string;
  },
): Promise<any> {
  return request(() =>
    (getApiClient() as any).POST(
      "/api/v1/partner/listing-applications/{application_id}/interview",
      {
        params: { path: { application_id: applicationId } },
        body,
      },
    ),
  );
}

export const HIRING_STEP_LABELS: Record<string, string> = {
  SUBMITTED: "Applied",
  UNDER_REVIEW: "Applied",
  SHORTLISTED: "Shortlisted",
  INTERVIEW: "Interview",
  CONTACTED: "Connected",
  CONNECTED: "Connected",
  REJECTED: "Not selected",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
};
