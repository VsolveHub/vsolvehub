"use client";

import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";
import type { PartnerListing } from "./queries";

export type JobOptions = Schemas["JobOptions"];
export type JobRoleTemplate = Schemas["JobRoleTemplate"];
export type JobOption = Schemas["JobOption"];
export type JobCreate = Schemas["JobCreateRequest"];
export type JobUpdate = Schemas["PatchedJobUpdateRequest"];

export function fetchJobOptions(): Promise<JobOptions> {
  return request(() => getApiClient().GET("/api/v1/jobs/options"));
}

export async function postJob(body: JobCreate): Promise<PartnerListing> {
  return (await request(() =>
    getApiClient().POST("/api/v1/partner/jobs", { body }),
  )) as PartnerListing;
}

export async function updateJob(id: string, body: JobUpdate): Promise<PartnerListing> {
  return (await request(() =>
    getApiClient().PATCH("/api/v1/partner/jobs/{listing_id}", {
      params: { path: { listing_id: id } },
      body,
    }),
  )) as PartnerListing;
}

/** Put a draft live, or reopen a closed job, at once. */
export async function publishJob(id: string): Promise<PartnerListing> {
  return (await request(() =>
    getApiClient().POST("/api/v1/partner/jobs/{listing_id}/publish", {
      params: { path: { listing_id: id } },
    }),
  )) as PartnerListing;
}

/** A draft copy to post the same role again. */
export async function duplicateJob(id: string): Promise<PartnerListing> {
  return (await request(() =>
    getApiClient().POST("/api/v1/partner/jobs/{listing_id}/duplicate", {
      params: { path: { listing_id: id } },
    }),
  )) as PartnerListing;
}

export function optionLabel(options: readonly JobOption[] | undefined, value: string | undefined | null) {
  if (!value) return "";
  return options?.find((option) => option.value === value)?.label ?? value;
}

/** "10:00:00" → "10:00" for a time input. */
export function hhmm(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "";
}

export function rupeesLabel(rupees: number): string {
  return `₹${rupees.toLocaleString("en-IN")}`;
}

export type CandidateMatch = Schemas["CandidateMatch"];

/** Candidates for one job, best match first: applicants plus open profiles nearby. */
export function fetchJobMatches(id: string): Promise<CandidateMatch[]> {
  return request(() =>
    getApiClient().GET("/api/v1/partner/jobs/{listing_id}/matches", {
      params: { path: { listing_id: id } },
    }),
  );
}

export function inviteToApply(listingId: string, profileId: string) {
  return request(() =>
    getApiClient().POST("/api/v1/partner/jobs/{listing_id}/invite/{profile_id}", {
      params: { path: { listing_id: listingId, profile_id: profileId } },
    }),
  );
}

export type InterviewMode = "IN_PERSON" | "PHONE" | "VIDEO";

/** `label` is a catalogue key — resolve with `t` at render time. */
export const INTERVIEW_MODES: ReadonlyArray<{ value: InterviewMode; label: string }> = [
  { value: "IN_PERSON", label: "listings.interview.mode.inPerson" },
  { value: "PHONE", label: "listings.interview.mode.phone" },
  { value: "VIDEO", label: "listings.interview.mode.video" },
];

export function proposeInterview(
  applicationId: string,
  body: { scheduled_date: string; start_time: string; mode: InterviewMode; location_text?: string; note?: string },
) {
  return request(() =>
    getApiClient().POST("/api/v1/partner/listing-applications/{application_id}/interview", {
      params: { path: { application_id: applicationId } },
      body,
    }),
  );
}

/**
 * Hiring steps in the words both sides read. These English words double as
 * step identifiers (see `applicant-card.tsx`), which maps them to catalogue
 * keys at render time.
 */
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
