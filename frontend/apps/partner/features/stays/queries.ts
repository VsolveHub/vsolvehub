"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@vsolve/api-client";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

async function stayPartnerRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${PUBLIC_API_BASE_URL}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const message =
      (body as { detail?: string })?.detail ||
      (body as { error?: { message?: string } | string })?.error &&
      typeof (body as { error?: { message?: string } | string }).error === "object"
        ? (body as { error?: { message?: string } }).error?.message
        : (body as { error?: string }).error;
    throw new Error(message || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/* ---------------------------------------------------------------------------
   Types — mirror backend/apps/stays/serializers.py & selectors.py
   --------------------------------------------------------------------------- */

export interface PartnerPropertyOverview {
  id: string;
  title: string;
  property_type: string;
  property_type_display: string;
  occupancy_model?: "SHARED" | "ENTIRE_UNIT" | "HOTEL_ROOM";
  locality: string;
  rating: number;
  total_units: number;
  active_guests: number;
  image_url: string;
  is_active: boolean;
}

export type StayReservationStatus =
  | "HELD"
  | "PAYMENT_PENDING"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_STAY"
  | "CHECKED_OUT"
  | "INSPECTED"
  | "SETTLED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW"
  | "EARLY_CHECKOUT"
  | "DISPUTED"
  | "RECOVERY_REQUIRED"
  | "FAILED"
  | "EXPIRED";

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

export interface StayCheckInInfo {
  id: string;
  actual_check_in_time: string;
  id_document_type: string;
  id_document_number: string;
  id_verified: boolean;
  guest_notes?: string;
  created_at: string;
}

export interface StayCheckOutInfo {
  id: string;
  actual_check_out_time: string;
  condition_grade: string;
  damage_found: boolean;
  damage_estimate_paise: number;
  inspection_notes?: string;
  created_at: string;
}

export interface PartnerReservationItem {
  id: string;
  status: StayReservationStatus;
  duration_mode: "DAILY" | "MONTHLY" | "LONG_TERM";
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
  property_id?: string;
  unit_type_id?: string;
  unit_id?: string;
  customer_id?: string;
  guest_name?: string;
  guest_phone?: string;
  guest_email?: string;
  property_title: string;
  property_type: string;
  property_locality: string;
  unit_name: string;
  unit_code: string;
  image_url: string;
  host_name: string;
  lines: StayReservationLineItem[];
  deposit?: StayDepositInfo;
  check_in?: StayCheckInInfo;
  check_out?: StayCheckOutInfo;
  created_at: string;
}

export interface PartnerStayMoneyEntry {
  id: string;
  reservation_id: string;
  property_title: string;
  kind: string;
  status: string;
  status_display?: string;
  gross_paise: number;
  commission_paise: number;
  net_paise: number;
  created_at: string;
  payout_batch_reference?: string | null;
  payout_batch_status?: string | null;
}

export interface PartnerStayMoney {
  gross_paise: number;
  commission_paise: number;
  net_paise: number;
  settled_net_paise: number;
  available_paise: number;
  pending_paise: number;
  paid_paise: number;
  deposit_held_paise: number;
  entries: PartnerStayMoneyEntry[];
}

export interface CheckInPayload {
  reservationId: string;
  id_document_type: "AADHAAR" | "PAN" | "PASSPORT" | "DRIVING_LICENSE";
  id_document_number: string;
  guest_notes?: string;
  condition_photo_urls?: string[];
}

export interface CheckOutPayload {
  reservationId: string;
  condition_grade: "EXCELLENT" | "GOOD" | "MINOR_DAMAGE" | "MAJOR_DAMAGE";
  damage_found: boolean;
  damage_estimate_paise: number;
  inspection_notes?: string;
  condition_photo_urls?: string[];
}

export interface ReassignUnitPayload {
  reservationId: string;
  target_unit_id: string;
}

export interface CandidateUnit {
  id: string;
  unit_code: string;
  unit_type_name: string;
  floor: string;
  status: string;
}

export interface CreatePropertyPayload {
  title: string;
  property_type: string;
  description?: string;
  locality: string;
}

export interface AddUnitPayload {
  propertyId: string;
  unit_type: string;
  unit_code: string;
  floor?: string;
}

/* ---------------------------------------------------------------------------
   Queries & Mutations
   --------------------------------------------------------------------------- */

export function usePartnerStayProperties() {
  return useQuery({
    queryKey: ["stays", "partner", "properties"],
    queryFn: () => stayPartnerRequest<PartnerPropertyOverview[]>("/api/v1/stays/partner/properties/"),
  });
}

export function usePartnerStayReservations(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return useQuery({
    queryKey: ["stays", "partner", "reservations", status],
    queryFn: () =>
      stayPartnerRequest<PartnerReservationItem[]>(`/api/v1/stays/partner/reservations/${query}`),
  });
}

export function usePartnerStayMoney() {
  return useQuery({
    queryKey: ["stays", "partner", "money"],
    queryFn: () => stayPartnerRequest<PartnerStayMoney>("/api/v1/stays/partner/money/"),
  });
}

export function usePartnerPropertyUnits(propertyId?: string, unitTypeId?: string) {
  return useQuery({
    queryKey: ["stays", "partner", "units", propertyId, unitTypeId],
    queryFn: () => {
      if (!propertyId) return Promise.resolve([] as CandidateUnit[]);
      const query = unitTypeId ? `?unit_type_id=${encodeURIComponent(unitTypeId)}` : "";
      return stayPartnerRequest<CandidateUnit[]>(
        `/api/v1/stays/partner/properties/${propertyId}/units/${query}`,
      );
    },
    enabled: !!propertyId,
  });
}

export interface PartnerUnitTypeOverview {
  id: string;
  name: string;
  sharing_type: string;
  sharing_display: string;
  is_ac: boolean;
  bathroom_type: string;
  furnishing_status: string;
  food_included: boolean;
  bhk: string;
  occupancy_capacity?: number | null;
  occupancy_model?: "SHARED" | "ENTIRE_UNIT" | "HOTEL_ROOM";
  room_class?: string | null;
  units_count: number;
}

export function usePartnerPropertyUnitTypes(propertyId?: string) {
  return useQuery({
    queryKey: ["stays", "partner", "unit-types", propertyId],
    queryFn: () => {
      if (!propertyId) return Promise.resolve([] as PartnerUnitTypeOverview[]);
      return stayPartnerRequest<PartnerUnitTypeOverview[]>(
        `/api/v1/stays/partner/properties/${propertyId}/unit-types/`,
      );
    },
    enabled: !!propertyId,
  });
}

export function usePartnerCreateProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePropertyPayload) =>
      stayPartnerRequest<{ id: string; title: string }>("/api/v1/stays/partner/properties/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stays", "partner"] });
    },
  });
}

export function usePartnerAddUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ propertyId, ...payload }: AddUnitPayload) =>
      stayPartnerRequest<{ id: string; unit_code: string }>(
        `/api/v1/stays/partner/properties/${propertyId}/add-unit/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stays", "partner"] });
    },
  });
}

export function usePartnerCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, ...payload }: CheckInPayload) =>
      stayPartnerRequest<{ id: string; status: string }>(
        `/api/v1/stays/partner/reservations/${reservationId}/check-in/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stays", "partner"] });
    },
  });
}

export function usePartnerCheckOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, ...payload }: CheckOutPayload) =>
      stayPartnerRequest<{ id: string; condition: string }>(
        `/api/v1/stays/partner/reservations/${reservationId}/check-out/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stays", "partner"] });
    },
  });
}

export function usePartnerReassignUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, target_unit_id }: ReassignUnitPayload) =>
      stayPartnerRequest<{ id: string; unit_code: string }>(
        `/api/v1/stays/partner/reservations/${reservationId}/reassign-unit/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_unit_id }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stays", "partner"] });
    },
  });
}

export function usePartnerStayReservation(reservationId?: string) {
  return useQuery({
    queryKey: ["stays", "partner", "reservation", reservationId],
    queryFn: () =>
      stayPartnerRequest<PartnerReservationItem>(
        `/api/v1/stays/partner/reservations/${reservationId}/`,
      ),
    enabled: Boolean(reservationId),
  });
}

export function usePartnerBlockUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ unitId, reason }: { unitId: string; reason?: string }) =>
      stayPartnerRequest<{ id: string; status: string; impacted_reservations: number }>(
        `/api/v1/stays/partner/units/${unitId}/block/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason || "Host maintenance block" }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stays", "partner"] });
    },
  });
}

export function usePartnerReactivateUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (unitId: string) =>
      stayPartnerRequest<{ status: string; unit_code: string }>(
        `/api/v1/stays/partner/units/${unitId}/reactivate/`,
        { method: "POST" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stays", "partner"] });
    },
  });
}

/* ---------------------------------------------------------------------------
   Room Configurations (UnitTypes), Pricing Rules, Policies & Visits
   --------------------------------------------------------------------------- */

export interface PartnerUnitTypeItem {
  id: string;
  name: string;
  sharing_type: string;
  sharing_display?: string;
  is_ac: boolean;
  bathroom_type: string;
  furnishing_status: string;
  food_included: boolean;
  bhk: string | null;
  occupancy_capacity?: number | null;
  occupancy_model?: "SHARED" | "ENTIRE_UNIT" | "HOTEL_ROOM";
  room_class?: string | null;
  units_count?: number;
}

export function usePartnerUnitTypes(propertyId?: string) {
  return useQuery({
    queryKey: ["stays", "partner", "property", propertyId, "unit-types"],
    queryFn: () =>
      stayPartnerRequest<PartnerUnitTypeItem[]>(
        `/api/v1/stays/partner/properties/${propertyId}/unit-types/`,
      ),
    enabled: Boolean(propertyId),
  });
}

export interface CreateUnitTypePayload {
  propertyId: string;
  variant_id?: string;
  name: string;
  description?: string;
  sharing_type?: string;
  sharing_count?: number;
  is_ac?: boolean;
  bathroom_type?: string;
  furnishing_status?: string;
  food_included?: boolean;
  bhk?: string;
  occupancy_capacity?: number;
  room_class?: string;
  bathrooms?: number;
  built_up_sqft?: number;
  facing?: string;
  floor?: number;
  amenities?: string[];
  image_url?: string;
}

export function usePartnerCreateUnitType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ propertyId, ...payload }: CreateUnitTypePayload) =>
      stayPartnerRequest<{ id: string; name: string }>(
        `/api/v1/stays/partner/properties/${propertyId}/unit-types/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stays", "partner"] });
    },
  });
}

export interface PartnerPricingRuleItem {
  id: string;
  duration_mode: "NIGHTLY" | "DAILY" | "WEEKLY" | "MONTHLY" | "HOURLY";
  base_rate_paise: number;
  deposit_paise: number;
  maintenance_paise: number;
  effective_from: string;
  effective_to?: string | null;
  is_active: boolean;
}

export function usePartnerPricingRules(unitTypeId?: string) {
  return useQuery({
    queryKey: ["stays", "partner", "unit-type", unitTypeId, "pricing-rules"],
    queryFn: () =>
      stayPartnerRequest<PartnerPricingRuleItem[]>(
        `/api/v1/stays/partner/unit-types/${unitTypeId}/pricing-rules/`,
      ),
    enabled: Boolean(unitTypeId),
  });
}

export interface CreatePricingRulePayload {
  unitTypeId: string;
  duration_mode: "NIGHTLY" | "DAILY" | "WEEKLY" | "MONTHLY" | "HOURLY";
  base_rate_paise: number;
  deposit_paise?: number;
  maintenance_paise?: number;
  effective_from?: string;
  effective_to?: string | null;
  is_active?: boolean;
}

export function usePartnerCreatePricingRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ unitTypeId, ...payload }: CreatePricingRulePayload) =>
      stayPartnerRequest<PartnerPricingRuleItem>(
        `/api/v1/stays/partner/unit-types/${unitTypeId}/pricing-rules/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stays", "partner"] });
    },
  });
}

export interface UpdatePricingRulePayload {
  ruleId: string;
  duration_mode?: PartnerPricingRuleItem["duration_mode"];
  base_rate_paise?: number;
  deposit_paise?: number;
  maintenance_paise?: number;
  effective_from?: string;
  effective_to?: string | null;
  is_active?: boolean;
}

export function usePartnerUpdatePricingRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, ...payload }: UpdatePricingRulePayload) =>
      stayPartnerRequest<PartnerPricingRuleItem>(
        `/api/v1/stays/partner/pricing-rules/${ruleId}/`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stays", "partner"] });
    },
  });
}

export interface PartnerPropertyPolicyItem {
  version: number;
  effective_from: string;
  effective_to?: string | null;
  is_active: boolean;
  check_in_time: string;
  check_out_time: string;
  max_guests_per_unit: number;
  id_verification_required: boolean;
  cancellation_policy: "FLEXIBLE" | "MODERATE" | "STRICT" | "NON_REFUNDABLE";
  notice_period_days: number;
  no_show_grace_minutes: number;
  no_show_first_night_charge_basis_points: number;
  no_show_deposit_forfeit_basis_points: number;
  house_rules: string;
}

export function usePartnerPropertyPolicy(propertyId?: string) {
  return useQuery({
    queryKey: ["stays", "partner", "property", propertyId, "policy"],
    queryFn: () =>
      stayPartnerRequest<PartnerPropertyPolicyItem>(
        `/api/v1/stays/partner/properties/${propertyId}/policy/`,
      ),
    enabled: Boolean(propertyId),
  });
}

export function usePartnerUpdatePropertyPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ propertyId, ...payload }: Partial<PartnerPropertyPolicyItem> & { propertyId: string }) =>
      stayPartnerRequest<PartnerPropertyPolicyItem>(
        `/api/v1/stays/partner/properties/${propertyId}/policy/`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stays", "partner"] });
    },
  });
}

export interface PropertyVisitItem {
  id: string;
  property: string;
  visitor_name: string;
  visitor_phone: string;
  visitor_email: string;
  preferred_date: string;
  time_slot: string;
  notes?: string;
  status: "REQUESTED" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  created_at: string;
}

export function usePartnerPropertyVisits() {
  return useQuery({
    queryKey: ["stays", "partner", "visits"],
    queryFn: () =>
      stayPartnerRequest<PropertyVisitItem[]>(
        `/api/v1/stays/partner/visits/`,
      ),
  });
}

