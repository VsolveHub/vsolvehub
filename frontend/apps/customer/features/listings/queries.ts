"use client";

import { apiFetch } from "@vsolve/api-client";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

export interface Listing {
  id: string;
  poster_name: string;
  service_name: string;
  variant_name: string;
  title: string;
  description: string;
  structured_fields: Record<string, string | number | boolean>;
  status: string;
  moderation_status: string;
  location_text: string;
  published_at: string | null;
  expires_at: string | null;
  application_count: number;
  contact_masked?: { phone: string; email: string };
  is_premium?: boolean;
}

export interface ApplicationStatusEvent {
  id: string;
  from_status: string;
  to_status: string;
  kind: string;
  note: string;
  created_at: string;
}

export interface ApplicationAttachment {
  id: string;
  file_url: string;
  file_name: string;
  created_at: string;
}

export interface ListingApplication {
  id: string;
  listing: string;
  listing_title: string;
  status: string;
  applicant_snapshot: Record<string, string>;
  applicant_name: string;
  applicant_phone: string;
  applicant_email: string;
  cover_note: string;
  resume_url: string;
  attachments?: ApplicationAttachment[];
  status_events?: ApplicationStatusEvent[];
  contact_revealed_at: string | null;
  withdrawn_at: string | null;
  duplicate_of: string | null;
  created_at: string;
  updated_at: string;
}

export interface CatalogCategory {
  id: string;
  slug: string;
  name: string;
  subcategories: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    service_count: number;
  }>;
}

async function listingRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${PUBLIC_API_BASE_URL}/api/v1${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    throw new Error(String((body as { detail?: string }).detail || `Request failed (${res.status})`));
  }
  return res.json() as Promise<T>;
}

export function fetchListings(filters: { q?: string; location?: string; service?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.location) params.set("location", filters.location);
  if (filters.service) params.set("service", filters.service);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return listingRequest<Listing[]>(`/listings${suffix}`);
}

export function fetchListing(id: string) {
  return listingRequest<Listing>(`/listings/${id}`);
}

export function fetchMyApplications() {
  return listingRequest<ListingApplication[]>("/my/listing-applications");
}

export function withdrawApplication(applicationId: string) {
  return listingRequest<ListingApplication>(`/my/listing-applications/${applicationId}/withdraw`, {
    method: "POST",
  });
}

export function submitListingApplication(
  listingId: string,
  payload: {
    name: string;
    phone: string;
    email?: string;
    experience?: string;
    cover_note?: string;
    resume_url?: string;
  },
) {
  return listingRequest<ListingApplication>(`/listings/${listingId}/applications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `listing-application:${listingId}:${payload.phone}:${Date.now()}`,
    },
    body: JSON.stringify(payload),
  });
}

export function reportListing(listingId: string, reason: string, detail = "") {
  return listingRequest(`/listings/${listingId}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, detail }),
  });
}

export function fetchJobCategories() {
  return listingRequest<CatalogCategory[]>("/categories/");
}
