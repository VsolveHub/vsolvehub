"use client";

import type { Schemas } from "@vsolve/api-client";

import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

export type RentalAsset = Schemas["RentalAsset"];
export type RentalBooking = Schemas["RentalBooking"];
export type CreateAssetRequest = Schemas["CreateAssetRequest"];
export type PartnerCapability = Schemas["PartnerCapability"];

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const token = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/)?.[1];
  return token ? decodeURIComponent(token) : "";
}

async function readError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as {
    detail?: string;
    message?: string;
  };
  throw new Error(body.detail ?? body.message ?? fallback);
}

export async function fetchPartnerRentalAssets(): Promise<RentalAsset[]> {
  const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/partner/rentals/assets`, {
    credentials: "include",
  });
  if (!res.ok) await readError(res, "Could not load rental assets.");
  return (await res.json()) as RentalAsset[];
}

export async function fetchPartnerRentalBookings(): Promise<RentalBooking[]> {
  const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/partner/rentals/bookings`, {
    credentials: "include",
  });
  if (!res.ok) await readError(res, "Could not load rental bookings.");
  return (await res.json()) as RentalBooking[];
}

export async function createPartnerRentalAsset(
  body: CreateAssetRequest,
): Promise<RentalAsset> {
  const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/partner/rentals/assets`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrfToken(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await readError(res, "Could not create asset.");
  return (await res.json()) as RentalAsset;
}

export async function submitPartnerRentalAsset(assetId: string): Promise<RentalAsset> {
  const res = await fetch(
    `${PUBLIC_API_BASE_URL}/api/v1/partner/rentals/assets/${assetId}/submit`,
    {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRFToken": csrfToken() },
    },
  );
  if (!res.ok) await readError(res, "Submit failed.");
  return (await res.json()) as RentalAsset;
}

export async function partnerRentalBookingAction(
  bookingId: string,
  action: "handover" | "return" | "release-deposit",
): Promise<RentalBooking> {
  const res = await fetch(
    `${PUBLIC_API_BASE_URL}/api/v1/partner/rentals/bookings/${bookingId}/${action}`,
    {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRFToken": csrfToken() },
    },
  );
  if (!res.ok) await readError(res, `${action} failed.`);
  return (await res.json()) as RentalBooking;
}

/** Approved A7 variants the partner may list against. */
export function rentalVariantChoices(
  capabilities: readonly PartnerCapability[] | undefined,
): Array<{ id: string; name: string }> {
  if (!capabilities) return [];
  return capabilities
    .filter((cap) => cap.workspace_key === "A7_RENTAL" && cap.status === "APPROVED")
    .map((cap) => ({ id: cap.variant_id, name: cap.variant_name }));
}
