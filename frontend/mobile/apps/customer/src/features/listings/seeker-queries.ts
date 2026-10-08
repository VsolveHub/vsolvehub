import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";

export interface JobProfile {
  id?: string;
  name?: string;
  full_name?: string;
  headline?: string;
  phone?: string;
  email?: string;
  experience?: string;
  experience_text?: string;
  preferred_location_text?: string;
  is_findable?: boolean;
  findable?: boolean;
  resume_url?: string;
  skills?: string[];
}

export type JobProfileWrite = Partial<JobProfile>;

export interface JobMatch {
  score?: number;
  match_reasons?: string[];
  listing_id?: string;
}

export interface JobForYou {
  listing: any;
  match: JobMatch;
}

export async function fetchMyJobProfile(): Promise<JobProfile | null> {
  try {
    const data = await request(() => (getApiClient() as any).GET("/api/v1/me/job-profile"));
    return (data as JobProfile | undefined) ?? null;
  } catch {
    return null;
  }
}

export function saveMyJobProfile(body: JobProfileWrite): Promise<JobProfile> {
  return request(() => (getApiClient() as any).PUT("/api/v1/me/job-profile", { body }));
}

export function fetchJobsForYou(): Promise<JobForYou[]> {
  return request(() => (getApiClient() as any).GET("/api/v1/jobs/for-you"));
}

export async function fetchMyMatch(listingId: string): Promise<JobMatch | null> {
  try {
    const data = await request(() =>
      (getApiClient() as any).GET("/api/v1/listings/{listing_id}/my-match", {
        params: { path: { listing_id: listingId } },
      }),
    );
    return (data as JobMatch | undefined) ?? null;
  } catch {
    return null;
  }
}

export function fetchSavedJobs(): Promise<any[]> {
  return request(() => (getApiClient() as any).GET("/api/v1/me/saved-jobs"));
}

export function setJobSaved(listingId: string, saved: boolean): Promise<any> {
  const path = { params: { path: { listing_id: listingId } } };
  return request(() =>
    saved
      ? (getApiClient() as any).POST("/api/v1/listings/{listing_id}/save", path)
      : (getApiClient() as any).DELETE("/api/v1/listings/{listing_id}/save", path),
  );
}
