import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import type { Listing } from "./queries";

export interface JobProfile {
  id?: string;
  full_name?: string;
  phone?: string;
  roles?: string[];
  skills?: string[];
  experience_band?: string;
  qualification?: string;
  languages?: string[];
  city?: string;
  area?: string;
  expected_salary_rupees?: number;
  job_types?: string[];
  available_from?: string;
  visibility?: "OPEN" | "APPLIED_ONLY";
  resume_name?: string;
  has_resume?: boolean;
  updated_at?: string;
  // Legacy / convenience fallbacks:
  name?: string;
  headline?: string;
  email?: string;
  experience?: string;
  experience_text?: string;
  preferred_location_text?: string;
  is_findable?: boolean;
  findable?: boolean;
  resume_url?: string;
}

export type JobProfileWrite = {
  full_name?: string;
  roles?: string[];
  skills?: string[];
  experience_band?: string;
  qualification?: string;
  languages?: string[];
  city?: string;
  area?: string;
  expected_salary_rupees?: number;
  job_types?: string[];
  available_from?: string;
  visibility?: "OPEN" | "APPLIED_ONLY";
  // Fallbacks:
  name?: string;
  headline?: string;
  email?: string;
  phone?: string;
  experience?: string;
  experience_text?: string;
  preferred_location_text?: string;
  is_findable?: boolean;
  findable?: boolean;
  resume_url?: string;
};

export interface JobMatch {
  score: number;
  level?: "STRONG" | "GOOD" | "OTHER";
  matched?: string[];
  missing?: string[];
  listing_id?: string;
}

export interface JobForYou {
  listing: Listing;
  match: JobMatch;
}

export async function fetchMyJobProfile(): Promise<JobProfile | null> {
  const data = await request(() => getApiClient().GET("/api/v1/me/job-profile"));
  return (data as JobProfile | undefined) ?? null;
}

export function saveMyJobProfile(body: JobProfileWrite): Promise<JobProfile> {
  return request(() => getApiClient().PUT("/api/v1/me/job-profile", { body })) as Promise<JobProfile>;
}

export function uploadProfileResume(file: {
  uri: string;
  name: string;
  type?: string;
}): Promise<JobProfile> {
  const formData = new FormData();
  formData.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.type || "application/pdf",
  } as any);

  return request(() =>
    getApiClient().POST("/api/v1/me/job-profile/resume", {
      body: formData,
      bodySerializer: () => formData,
    }),
  ) as Promise<JobProfile>;
}

export function fetchJobsForYou(): Promise<JobForYou[]> {
  return request(() => getApiClient().GET("/api/v1/jobs/for-you")) as Promise<JobForYou[]>;
}

export async function fetchMyMatch(listingId: string): Promise<JobMatch | null> {
  const data = await request(() =>
    getApiClient().GET("/api/v1/listings/{listing_id}/my-match", {
      params: { path: { listing_id: listingId } },
    }),
  );
  return (data as JobMatch | undefined) ?? null;
}

export function quickApply(listingId: string, note: string = ""): Promise<any> {
  return request(() =>
    getApiClient().POST("/api/v1/listings/{listing_id}/quick-apply", {
      params: { path: { listing_id: listingId } },
      body: { note },
    }),
  );
}

export function fetchSavedJobs(): Promise<Listing[]> {
  return request(() => getApiClient().GET("/api/v1/me/saved-jobs")) as Promise<Listing[]>;
}

export function setJobSaved(listingId: string, saved: boolean): Promise<any> {
  const path = { params: { path: { listing_id: listingId } } };
  return request(() =>
    saved
      ? getApiClient().POST("/api/v1/listings/{listing_id}/save", path)
      : getApiClient().DELETE("/api/v1/listings/{listing_id}/save", path),
  );
}

export function answerInterview(
  interviewId: string,
  action: "accept" | "reschedule" | "decline",
  note: string = "",
): Promise<any> {
  return request(() =>
    getApiClient().POST("/api/v1/my/interviews/{interview_id}/{action}", {
      params: { path: { interview_id: interviewId, action } },
      body: { note },
    }),
  );
}

export const MATCH_LOOK: Record<string, { label: string; tone: "success" | "info" | "neutral" }> = {
  STRONG: { label: "Strong match", tone: "success" },
  GOOD: { label: "Good match", tone: "info" },
  OTHER: { label: "Some match", tone: "neutral" },
};

export const HIRING_STEP_LABELS: Record<string, string> = {
  SUBMITTED: "Applied",
  UNDER_REVIEW: "Under review",
  SHORTLISTED: "Shortlisted",
  INTERVIEW: "Interview",
  CONTACTED: "Connected",
  CONNECTED: "Connected",
  REJECTED: "Not selected",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
};
