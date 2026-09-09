"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@vsolve/api-client";
import { getStableIdempotencyKey } from "@vsolve/api-client";
import type { PaymentAttempt } from "@/features/payment/model/outcome";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

async function stayRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${PUBLIC_API_BASE_URL}${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, any>;
    let message: string | undefined = body?.detail;
    if (!message && body?.error) {
      message = typeof body.error === "object" ? body.error?.message : body.error;
    }
    throw new Error(message || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/* ---------------------------------------------------------------------------
   Types
   --------------------------------------------------------------------------- */

export interface StayBrowseUnitCard {
  unit_type_id: string;
  property_id: string;
  property_title: string;
  property_type: string;
  property_type_display: string;
  occupancy_model?: "SHARED" | "ENTIRE_UNIT" | "HOTEL_ROOM";
  locality: string;
  rating: number;
  reviews_count: number;
  unit_name: string;
  sharing_type: string;
  sharing_display: string;
  sharing_count: number;
  is_ac: boolean;
  bathroom_type: string;
  furnishing_status: string;
  furnishing_display: string;
  food_included: boolean;
  bhk: string;
  occupancy_capacity?: number | null;
  room_class?: string | null;
  bathrooms: number;
  built_up_sqft: number;
  facing: string;
  floor: string;
  amenities: string[];
  image_url: string;
  price_paise: number;
  price_per_month: number;
  daily_rate_paise?: number;
  monthly_rate_paise?: number;
  deposit_paise: number;
  maintenance_paise: number;
  duration_mode: string;
  supported_duration_modes?: string[];
  total_units: number;
  units_available: number;
  host_name: string;
  host_verified: boolean;
}

export interface PropertyPolicyInfo {
  check_in_time: string;
  check_out_time: string;
  max_guests_per_unit: number;
  id_verification_required: boolean;
  cancellation_policy: string;
  notice_period_days: number;
  house_rules: string[];
}

export interface PropertyMediaItem {
  id: string;
  url: string;
  is_primary: boolean;
  caption: string;
}

export interface UnitTypePricing {
  daily_paise: number;
  monthly_paise: number;
  deposit_paise: number;
  maintenance_paise: number;
  duration_mode: string;
}

export interface PropertyUnitTypeDetail {
  id: string;
  name: string;
  sharing_type: string;
  sharing_display: string;
  sharing_count: number;
  is_ac: boolean;
  bathroom_type: string;
  furnishing_status: string;
  furnishing_display: string;
  food_included: boolean;
  bhk: string;
  occupancy_capacity?: number | null;
  room_class?: string | null;
  bathrooms: number;
  built_up_sqft: number;
  facing: string;
  floor: string;
  amenities: string[];
  image_url: string;
  pricing: UnitTypePricing;
  units_available: number;
}

export interface PropertyDetailResponse {
  id: string;
  title: string;
  property_type: string;
  property_type_display: string;
  occupancy_model?: "SHARED" | "ENTIRE_UNIT" | "HOTEL_ROOM";
  description: string;
  locality: string;
  address: {
    line1: string;
    city: string;
    pincode: string;
    latitude: number;
    longitude: number;
  } | null;
  rating: number;
  reviews_count: number;
  host: {
    name: string;
    phone_verified: boolean;
    id_verified: boolean;
    member_since: string;
  };
  policy: PropertyPolicyInfo | null;
  media: PropertyMediaItem[];
  unit_types: PropertyUnitTypeDetail[];
}

export interface StayReservationLineItem {
  id: string;
  kind: string;
  description: string;
  amount_paise: number;
}

export interface StayDepositInfo {
  id: string;
  status: string;
  authorized_amount_paise: number;
  consumed_amount_paise: number;
  refunded_amount_paise: number;
  dispute_reason: string;
}

export interface StayReservationDetail {
  id: string;
  status: string;
  duration_mode: "DAILY" | "NIGHTLY" | "WEEKLY" | "MONTHLY" | "HOURLY";
  lease_duration_months: number;
  start_date: string;
  end_date: string;
  guest_count: number;
  total_nights: number;
  base_amount_paise: number;
  maintenance_amount_paise: number;
  deposit_amount_paise: number;
  one_time_charges_paise: number;
  tax_amount_paise: number;
  total_amount_paise: number;
  policy_snapshot: Record<string, any>;
  property_title: string;
  property_type: string;
  property_locality: string;
  unit_name: string;
  unit_code: string;
  image_url: string;
  host_name: string;
  host_phone: string;
  host_verified?: boolean;
  property_address: PropertyDetailResponse["address"];
  check_in_time: string;
  check_out_time: string;
  receipt_url: string | null;
  lines: StayReservationLineItem[];
  deposit?: StayDepositInfo;
  created_at: string;
}

export interface CreateHoldParams {
  unit_type_id: string;
  start_date: string;
  end_date: string;
  duration_mode?: "DAILY" | "NIGHTLY" | "WEEKLY" | "MONTHLY" | "HOURLY";
  guest_count?: number;
  lease_duration_months?: number;
  primary_tenant_name: string;
  guest_phone: string;
  guest_email: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  agreement_version: string;
  agreement_accepted: boolean;
  kyc_document?: File;
}

/* ---------------------------------------------------------------------------
   Client API Functions
   --------------------------------------------------------------------------- */

export async function fetchStayBrowse(filters?: {
  locality?: string;
  property_type?: string;
  sharing_type?: string;
  occupancy_capacity_gte?: number;
  room_class?: string;
  max_price?: number;
  bhk?: string;
  service_slug?: string;
  subcategory?: string;
  unit_type_id?: string;
  duration_mode?: string;
  is_ac?: boolean;
  food_included?: boolean;
  start_date?: string;
  end_date?: string;
  furnishing_status?: string;
}): Promise<StayBrowseUnitCard[]> {
  const params = new URLSearchParams();
  if (filters?.locality) params.set("locality", filters.locality);
  if (filters?.property_type) params.set("property_type", filters.property_type);
  if (filters?.sharing_type) params.set("sharing_type", filters.sharing_type);
  if (filters?.occupancy_capacity_gte !== undefined) {
    params.set("occupancy_capacity__gte", String(filters.occupancy_capacity_gte));
  }
  if (filters?.room_class) params.set("room_class", filters.room_class);
  if (filters?.max_price) params.set("max_price", filters.max_price.toString());
  if (filters?.bhk) params.set("bhk", filters.bhk);
  if (filters?.service_slug) params.set("service", filters.service_slug);
  if (filters?.subcategory) params.set("subcategory", filters.subcategory);
  if (filters?.unit_type_id) params.set("unit_type_id", filters.unit_type_id);
  if (filters?.duration_mode) params.set("duration_mode", filters.duration_mode);
  if (filters?.is_ac !== undefined) params.set("is_ac", String(filters.is_ac));
  if (filters?.food_included !== undefined) params.set("food_included", String(filters.food_included));
  if (filters?.start_date) params.set("start_date", filters.start_date);
  if (filters?.end_date) params.set("end_date", filters.end_date);
  if (filters?.is_ac !== undefined) params.set("is_ac", filters.is_ac ? "true" : "false");
  if (filters?.food_included !== undefined) params.set("food_included", filters.food_included ? "true" : "false");
  if (filters?.furnishing_status) params.set("furnishing_status", filters.furnishing_status);

  const query = params.toString() ? `?${params.toString()}` : "";
  return stayRequest<StayBrowseUnitCard[]>(`/api/v1/stays/browse/${query}`);
}

export async function fetchPropertyDetail(
  propertyId: string,
  availability?: { start_date?: string; end_date?: string; duration_mode?: string },
): Promise<PropertyDetailResponse> {
  const params = new URLSearchParams();
  if (availability?.start_date) params.set("start_date", availability.start_date);
  if (availability?.end_date) params.set("end_date", availability.end_date);
  if (availability?.duration_mode) params.set("duration_mode", availability.duration_mode);
  const query = params.size ? `?${params.toString()}` : "";
  return stayRequest<PropertyDetailResponse>(`/api/v1/stays/properties/${propertyId}/${query}`);
}

export async function createStayHold(payload: CreateHoldParams): Promise<StayReservationDetail> {
  const form = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) form.append(key, value instanceof File ? value : String(value));
  }
  const operation = `stay-hold:${payload.unit_type_id}:${payload.start_date}:${payload.end_date}`;
  return stayRequest<StayReservationDetail>("/api/v1/stays/holds/", {
    method: "POST",
    headers: { "Idempotency-Key": getStableIdempotencyKey(operation) },
    body: form,
  });
}

export async function startStayPayment(reservationId: string): Promise<PaymentAttempt[]> {
  const result = await stayRequest<{ payment_attempts: PaymentAttempt[] }>(
    `/api/v1/stays/reservations/${reservationId}/payment/`,
    {
      method: "POST",
      headers: {
        "Idempotency-Key": getStableIdempotencyKey(`stay-payment:${reservationId}`),
      },
    },
  );
  return result.payment_attempts;
}

export async function fetchPaymentAttempt(attemptId: string): Promise<PaymentAttempt> {
  return stayRequest<PaymentAttempt>(`/api/v1/payment-attempts/${attemptId}/`);
}

export async function simulateStayPayment(attemptId: string): Promise<PaymentAttempt> {
  return stayRequest<PaymentAttempt>(`/api/v1/payment-attempts/${attemptId}/simulate-capture/`, {
    method: "POST",
  });
}

export async function releaseStayHold(reservationId: string): Promise<StayReservationDetail> {
  return stayRequest<StayReservationDetail>(`/api/v1/stays/holds/${reservationId}/release/`, {
    method: "POST",
    headers: {
      "Idempotency-Key": getStableIdempotencyKey(`stay-release:${reservationId}`),
    },
  });
}

export async function fetchStayReservation(reservationId: string): Promise<StayReservationDetail> {
  return stayRequest<StayReservationDetail>(`/api/v1/stays/reservations/${reservationId}/`);
}

export async function confirmStayReservation(reservationId: string): Promise<StayReservationDetail> {
  return stayRequest<StayReservationDetail>(`/api/v1/stays/reservations/${reservationId}/confirm/`, {
    method: "POST",
  });
}

export async function fetchCustomerReservations(tab?: "upcoming" | "completed"): Promise<StayReservationDetail[]> {
  const query = tab ? `?tab=${tab}` : "";
  return stayRequest<StayReservationDetail[]>(`/api/v1/stays/my-reservations/${query}`);
}

export async function cancelStayReservation(
  reservationId: string,
  reason: string = "Customer requested cancellation",
): Promise<StayReservationDetail> {
  return stayRequest<StayReservationDetail>(`/api/v1/stays/reservations/${reservationId}/cancel/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export async function requestStayExtension(
  reservationId: string,
  additionalNights: number = 0,
  additionalMonths: number = 0,
): Promise<{
  extension_id: string;
  original_end_date: string;
  extended_end_date: string;
  additional_nights: number;
  additional_amount_paise: number;
  additional_deposit_paise?: number;
  status: string;
}> {
  return stayRequest(`/api/v1/stays/reservations/${reservationId}/extensions/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      additional_nights: additionalNights,
      additional_months: additionalMonths,
    }),
  });
}

export async function confirmStayExtension(extensionId: string): Promise<StayReservationDetail> {
  return stayRequest<StayReservationDetail>(`/api/v1/stays/extensions/${extensionId}/confirm/`, {
    method: "POST",
  });
}

export async function earlyCheckoutStay(
  reservationId: string,
  earlyCheckoutDate?: string,
  reason: string = "Early departure",
): Promise<StayReservationDetail> {
  return stayRequest<StayReservationDetail>(`/api/v1/stays/reservations/${reservationId}/early-checkout/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ early_checkout_date: earlyCheckoutDate, reason }),
  });
}

export async function disputeStayDamage(
  reservationId: string,
  disputeReason: string,
): Promise<StayReservationDetail> {
  return stayRequest<StayReservationDetail>(`/api/v1/stays/reservations/${reservationId}/dispute/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dispute_reason: disputeReason }),
  });
}

export interface StayFilterOption {
  code: string;
  label: string;
  description?: string;
}

export interface StayFilterDefinition {
  code: string;
  prompt: string;
  kind: string;
  is_required: boolean;
  display_order: number;
  options: StayFilterOption[];
}

export async function fetchStayFilterDefinitions(
  serviceSlug?: string,
  occupancyModel?: "SHARED" | "ENTIRE_UNIT" | "HOTEL_ROOM",
): Promise<StayFilterDefinition[]> {
  const params = new URLSearchParams();
  if (serviceSlug) params.set("service_slug", serviceSlug);
  if (occupancyModel) params.set("occupancy_model", occupancyModel);
  const query = params.toString() ? `?${params.toString()}` : "";
  return stayRequest<StayFilterDefinition[]>(`/api/v1/stays/filter-definitions/${query}`);
}

export function useStayReservations(tab?: "upcoming" | "completed") {
  return useQuery({
    queryKey: ["stays", "my-reservations", tab ?? "all"],
    queryFn: () => fetchCustomerReservations(tab),
    staleTime: 30_000,
  });
}

export interface ScheduleVisitPayload {
  visitor_name: string;
  visitor_phone: string;
  visitor_email?: string;
  preferred_date: string;
  time_slot: string;
  notes?: string;
}

export async function schedulePropertyVisit(
  propertyId: string,
  payload: ScheduleVisitPayload
): Promise<any> {
  return stayRequest(`/api/v1/stays/properties/${propertyId}/visits/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

