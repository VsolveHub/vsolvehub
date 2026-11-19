"use client";

import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

export type JobProfile = Schemas["JobSeekerProfile"];
export type JobProfileWrite = Schemas["JobSeekerProfileWriteRequest"];
export type JobMatch = Schemas["Match"];
export type JobForYou = Schemas["JobForYou"];

/** The signed-in seeker's profile, or null when they have not made one yet. */
export async function fetchMyJobProfile(): Promise<JobProfile | null> {
  const data = await request(() => getApiClient().GET("/api/v1/me/job-profile"));
  return (data as JobProfile | undefined) ?? null;
}

export function saveMyJobProfile(body: JobProfileWrite): Promise<JobProfile> {
  return request(() => getApiClient().PUT("/api/v1/me/job-profile", { body }));
}

export async function uploadProfileResume(file: File): Promise<JobProfile> {
  return (await request(() =>
    getApiClient().POST("/api/v1/me/job-profile/resume", {
      body: { file } as never,
      bodySerializer() {
        const form = new FormData();
        form.append("file", file, file.name);
        return form;
      },
    }),
  )) as JobProfile;
}

export function fetchJobsForYou(): Promise<JobForYou[]> {
  return request(() => getApiClient().GET("/api/v1/jobs/for-you"));
}

export async function fetchMyMatch(listingId: string): Promise<JobMatch | null> {
  const data = await request(() =>
    getApiClient().GET("/api/v1/listings/{listing_id}/my-match", {
      params: { path: { listing_id: listingId } },
    }),
  );
  return (data as JobMatch | undefined) ?? null;
}

/** `skills`: the job's skills the seeker ticked. They are added to the profile, never replacing it. */
export function quickApply(listingId: string, note: string, skills: string[] = []) {
  return request(() =>
    getApiClient().POST("/api/v1/listings/{listing_id}/quick-apply", {
      params: { path: { listing_id: listingId } },
      body: { note, skills },
    }),
  );
}

const skillKey = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/** The ticked skills that aren't on the profile yet — what applying will add. */
export function newSkillsFrom(profileSkills: readonly string[], ticked: readonly string[]): string[] {
  const have = new Set(profileSkills.map(skillKey));
  const seen = new Set<string>();
  return ticked.filter((s) => {
    const key = skillKey(s);
    if (!key || have.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function fetchSavedJobs() {
  return request(() => getApiClient().GET("/api/v1/me/saved-jobs"));
}

export function setJobSaved(listingId: string, saved: boolean) {
  const path = { params: { path: { listing_id: listingId } } };
  return request(() =>
    saved
      ? getApiClient().POST("/api/v1/listings/{listing_id}/save", path)
      : getApiClient().DELETE("/api/v1/listings/{listing_id}/save", path),
  );
}

export const MATCH_LOOK: Record<string, { label: string; tone: "success" | "info" | "neutral" }> = {
  STRONG: { label: "Strong match", tone: "success" },
  GOOD: { label: "Good match", tone: "info" },
  OTHER: { label: "Some match", tone: "neutral" },
};

/** The candidate answers an interview invitation. */
export function answerInterview(interviewId: string, action: "accept" | "reschedule" | "decline", note = "") {
  return request(() =>
    getApiClient().POST("/api/v1/my/interviews/{interview_id}/{action}", {
      params: { path: { interview_id: interviewId, action } },
      body: { note },
    }),
  );
}

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
