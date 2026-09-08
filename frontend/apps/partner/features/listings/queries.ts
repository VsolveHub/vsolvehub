"use client";

import { apiFetch } from "@vsolve/api-client";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

export interface PartnerListing {
  id: string;
  poster_name: string;
  service_name: string;
  variant_name: string;
  title: string;
  description: string;
  structured_fields: Record<string, string | number | boolean>;
  status: string;
  moderation_status: string;
  moderation_reason: string;
  location_text: string;
  contact_phone: string;
  contact_email: string;
  application_count: number;
  published_at: string | null;
  expires_at: string | null;
  closed_at: string | null;
  removed_at: string | null;
  created_at: string;
}

export interface ApplicationAttachment {
  id: string;
  file_url: string;
  file_name: string;
  created_at: string;
}

export interface ApplicationStatusEvent {
  id: string;
  from_status: string;
  to_status: string;
  kind: string;
  note: string;
  created_at: string;
}

export interface PartnerApplication {
  id: string;
  listing: string;
  listing_title: string;
  status: string;
  applicant_name: string;
  applicant_phone: string;
  applicant_email: string;
  applicant_snapshot: Record<string, string>;
  cover_note: string;
  resume_url: string;
  attachments?: ApplicationAttachment[];
  status_events?: ApplicationStatusEvent[];
  contact_revealed_at: string | null;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListingHome {
  active_listings: number;
  pending_moderation: number;
  new_applications: number;
  plan_limit: number | null;
  subscription: null | {
    id: string;
    plan_name: string;
    status: string;
    ends_at: string | null;
  };
}

export interface VendorSubscriptionPlan {
  id: string;
  code: string;
  name: string;
  price_paise: number;
  currency: string;
  duration_days: number;
  max_active_listings: number;
  features_schema: Record<string, unknown>;
  is_active: boolean;
}

export interface VendorSubscription {
  id: string;
  plan: string;
  payment_attempt_id?: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  auto_renew: boolean;
  created_at: string;
}

export interface CatalogServiceItem {
  id: string;
  slug: string;
  name: string;
  variants: Array<{
    id: string;
    code: string;
    name: string;
    fulfilment_archetype: string;
  }>;
}

async function partnerListingRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${PUBLIC_API_BASE_URL}/api/v1${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    throw new Error(String((body as { detail?: string }).detail || `Request failed (${res.status})`));
  }
  return (await res.json()) as T;
}

export function fetchListingHome() {
  return partnerListingRequest<ListingHome>("/partner/listings/home");
}

export const fetchPartnerListingHome = fetchListingHome;

export function fetchPartnerListings() {
  return partnerListingRequest<PartnerListing[]>("/partner/listings");
}

export function fetchPartnerListing(id: string) {
  return partnerListingRequest<PartnerListing>(`/partner/listings/${id}`);
}

export const fetchPartnerListingDetail = fetchPartnerListing;

export function createPartnerListing(payload: {
  variant?: string;
  service_id?: string;
  service_slug?: string;
  title: string;
  description: string;
  location_text: string;
  contact_phone: string;
  contact_email?: string;
  structured_fields: Record<string, string>;
  is_premium?: boolean;
}) {
  return partnerListingRequest<PartnerListing>("/partner/listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updatePartnerListing(
  listingId: string,
  payload: Partial<{
    title: string;
    description: string;
    location_text: string;
    contact_phone: string;
    contact_email: string;
    structured_fields: Record<string, string>;
  }>,
) {
  return partnerListingRequest<PartnerListing>(`/partner/listings/${listingId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function runListingAction(
  listingId: string,
  action: "submit" | "publish" | "republish" | "close",
  reason = "",
) {
  return partnerListingRequest<PartnerListing>(`/partner/listings/${listingId}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export function fetchListingApplications(listingId: string) {
  return partnerListingRequest<PartnerApplication[]>(`/partner/listings/${listingId}/applications`);
}

export function revealApplicationContact(applicationId: string) {
  return partnerListingRequest<PartnerApplication>(
    `/partner/listing-applications/${applicationId}/reveal-contact`,
    {
      method: "POST",
    },
  );
}

export function updateApplicationStatus(applicationId: string, status: string) {
  return partnerListingRequest<PartnerApplication>(
    `/partner/listing-applications/${applicationId}/status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    },
  );
}

export function fetchSubscriptionPlans() {
  return partnerListingRequest<VendorSubscriptionPlan[]>("/partner/listing-subscription-plans");
}

export function purchaseSubscription(planId: string) {
  return partnerListingRequest<VendorSubscription>(
    `/partner/listing-subscription-plans/${planId}/purchase`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `sub-purchase:${planId}:${Date.now()}`,
      },
    },
  );
}

export function completePaymentAttempt(attemptId: string) {
  return partnerListingRequest<{ id: string; status: string }>(
    `/payment-attempts/${attemptId}/simulate-capture/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
  );
}

export function fetchCareerServices() {
  return partnerListingRequest<CatalogServiceItem[]>("/partner/listings/roles");
}

export function reportApplicantApplication(applicationId: string, reason: string, detail = "") {
  return partnerListingRequest(`/applications/${applicationId}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, detail }),
  });
}

