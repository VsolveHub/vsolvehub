"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@vsolve/api-client";
import { EXPIRING_STATE, queryKeys } from "@vsolve/query";

import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

/**
 * A7_RENTAL partner data layer.
 *
 * `apiFetch` rather than the typed `getApiClient()` every other feature module
 * uses: rentals has no proposal under `contracts/openapi/` yet, so there is no
 * generated `Schemas` entry to type against. This still gets the behavior that
 * actually mattered — TanStack Query caching, real loading/error state, and
 * cache invalidation on mutation — instead of the hand-rolled `useState`/
 * `useEffect` + hardcoded demo-data fallback the rentals pages had before.
 * Once rentals is registered in the OpenAPI contract, these hooks should move
 * to `getApiClient()` like every other feature module.
 */

async function rentalRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${PUBLIC_API_BASE_URL}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const message =
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
   Types — mirror backend/apps/rentals/serializers.py
   --------------------------------------------------------------------------- */

export interface RentalVariantOption {
  variant_id: string;
  variant_name: string;
  service_id: string;
  service_name: string;
  subcategory_name: string;
  category_name: string;
}

export type RentalAssetStatus = "ACTIVE" | "UNDER_MAINTENANCE" | "RETIRED";
export type RentalConditionGrade = "EXCELLENT" | "GOOD" | "FAIR";

export interface RentalAsset {
  id: string;
  partner_id: string;
  variant_id: string;
  title: string;
  description: string;
  asset_identifier: string;
  is_serialized: boolean;
  quantity_available: number;
  daily_price_paise: number;
  deposit_paise: number;
  condition_grade: string;
  current_status: string;
  created_at: string;
  updated_at: string;
}

export interface RentalAssetInput {
  variant_id: string;
  title: string;
  description: string;
  asset_identifier: string;
  is_serialized: boolean;
  quantity_available: number;
  daily_price_paise: number;
  deposit_paise: number;
  condition_grade: RentalConditionGrade;
  current_status: RentalAssetStatus;
}

export interface RentalDeposit {
  id: string;
  amount_paise: number;
  authorized_amount_paise: number;
  captured_amount_paise: number;
  consumed_amount_paise: number;
  refunded_amount_paise: number;
  status: string;
  capture_mode: string;
  updated_at: string;
}

export interface RentalExtension {
  id: string;
  previous_end: string;
  new_end: string;
  price_delta_paise: number;
  deposit_delta_paise: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  created_at: string;
  approved_at: string | null;
}

export interface RentalBookingLine {
  id: string;
  line_type: string;
  amount_paise: number;
  currency: string;
  description: string;
}

export interface RentalHandover {
  id: string;
  assigned_serial: string;
  condition_notes: string;
  photo_urls: string[];
  checklist: Record<string, unknown>;
  handed_over_at: string;
}

export interface RentalReturnInspection {
  id: string;
  returned_at: string;
  condition_notes: string;
  photo_urls: string[];
  damage_found: boolean;
  damage_estimated_paise: number;
  damage_details: Record<string, unknown>;
  late_days: number;
  late_fee_paise: number;
  settlement_matrix_outcome: Record<string, unknown>;
}

export interface RentalBooking {
  id: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: {
    line1?: string;
    line2?: string;
    locality?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  } | null;
  asset_id: string;
  asset_title: string;
  daily_price_paise?: number;
  deposit_paise?: number;
  vendor_name: string;
  assigned_serial: string;
  rental_start: string;
  rental_end: string;
  delivery_mode: string;
  status: string;
  lines: RentalBookingLine[];
  deposit: RentalDeposit | null;
  handover: RentalHandover | null;
  return_inspection: RentalReturnInspection | null;
  extensions: RentalExtension[];
  created_at: string;
  updated_at: string;
}

export interface RentalLedgerEntry {
  id: string;
  booking_id: string | null;
  rental_booking_id: string | null;
  kind: string;
  status: string;
  gross_paise: number;
  commission_paise: number;
  net_paise: number;
  currency: string;
  calculation_snapshot: Record<string, unknown>;
  corrects_id: string | null;
  reason: string;
  created_at: string;
}

interface RentalLedgerPage {
  results: RentalLedgerEntry[];
  next: string | null;
}

/* ---------------------------------------------------------------------------
   Reads
   --------------------------------------------------------------------------- */

export function useRentalVariantOptions() {
  return useQuery({
    queryKey: [...queryKeys.rentals.all, "variants"] as const,
    queryFn: () => rentalRequest<RentalVariantOption[]>("/api/v1/rentals/partner/variants/"),
  });
}

export function usePartnerRentalAssets() {
  return useQuery({
    queryKey: queryKeys.rentals.assets(),
    queryFn: () => rentalRequest<RentalAsset[]>("/api/v1/rentals/partner/assets/"),
    ...EXPIRING_STATE,
  });
}

export function usePartnerRentalAsset(assetId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.rentals.assets(), assetId] as const,
    queryFn: () => rentalRequest<RentalAsset>(`/api/v1/rentals/partner/assets/${assetId}/`),
    enabled: Boolean(assetId),
    ...EXPIRING_STATE,
  });
}

export function usePartnerRentalBookings() {
  return useQuery({
    queryKey: queryKeys.rentals.bookings(),
    queryFn: () => rentalRequest<RentalBooking[]>("/api/v1/rentals/partner/bookings/"),
    ...EXPIRING_STATE,
  });
}

export function usePartnerRentalLedger() {
  return useQuery({
    queryKey: queryKeys.rentals.ledger(),
    queryFn: () => rentalRequest<RentalLedgerPage>("/api/v1/partner/ledger/?source=rental"),
    ...EXPIRING_STATE,
  });
}

/* ---------------------------------------------------------------------------
   Commands
   --------------------------------------------------------------------------- */

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function useCreateRentalAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RentalAssetInput) =>
      rentalRequest<RentalAsset>("/api/v1/rentals/partner/assets/", jsonInit("POST", input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rentals.assets() }),
  });
}

export function useUpdateRentalAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<RentalAssetInput> }) =>
      rentalRequest<RentalAsset>(`/api/v1/rentals/partner/assets/${id}/`, jsonInit("PUT", patch)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rentals.assets() }),
  });
}

export interface RecordHandoverInput {
  bookingId: string;
  photo_urls: string[];
  condition_notes?: string;
  assigned_serial?: string;
}

export function useRecordHandover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, ...body }: RecordHandoverInput) =>
      rentalRequest<RentalBooking>(
        `/api/v1/rentals/partner/bookings/${bookingId}/handover/`,
        jsonInit("POST", body),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rentals.bookings() }),
  });
}

export interface RecordReturnInspectionInput {
  bookingId: string;
  photo_urls: string[];
  condition_notes?: string;
  damage_found?: boolean;
  damage_estimated_paise?: number;
  late_days?: number;
}

export function useRecordReturnInspection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, ...body }: RecordReturnInspectionInput) =>
      rentalRequest<RentalBooking>(
        `/api/v1/rentals/partner/bookings/${bookingId}/return-inspection/`,
        jsonInit("POST", body),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rentals.bookings() }),
  });
}

export function useInitiateReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) =>
      rentalRequest<RentalBooking>(
        `/api/v1/rentals/partner/bookings/${bookingId}/initiate-return/`,
        { method: "POST" },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rentals.bookings() }),
  });
}

export function useApproveExtension() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (extensionId: string) =>
      rentalRequest<RentalBooking>(
        `/api/v1/rentals/partner/extensions/${extensionId}/approve/`,
        { method: "POST" },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rentals.bookings() }),
  });
}

export function useRejectExtension() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (extensionId: string) =>
      rentalRequest<RentalBooking>(
        `/api/v1/rentals/partner/extensions/${extensionId}/reject/`,
        { method: "POST" },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rentals.bookings() }),
  });
}

export interface RentalMaintenancePeriod {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  created_at: string;
}

export interface RentalAssetMedia {
  id: string;
  url: string;
  caption: string;
  is_primary: boolean;
  created_at: string;
}

export function usePartnerAssetMaintenance(assetId: string) {
  return useQuery({
    queryKey: ["rentals", "partner", "assets", assetId, "maintenance"],
    queryFn: () =>
      rentalRequest<RentalMaintenancePeriod[]>(
        `/api/v1/rentals/partner/assets/${assetId}/maintenance/`,
      ),
    enabled: Boolean(assetId),
  });
}

export function useAddAssetMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      assetId,
      ...body
    }: {
      assetId: string;
      start_date: string;
      end_date: string;
      reason?: string;
    }) =>
      rentalRequest<RentalMaintenancePeriod>(
        `/api/v1/rentals/partner/assets/${assetId}/maintenance/`,
        jsonInit("POST", body),
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["rentals", "partner", "assets", variables.assetId, "maintenance"],
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.rentals.assets() });
    },
  });
}

export function usePartnerAssetMedia(assetId: string) {
  return useQuery({
    queryKey: ["rentals", "partner", "assets", assetId, "media"],
    queryFn: () =>
      rentalRequest<RentalAssetMedia[]>(
        `/api/v1/rentals/partner/assets/${assetId}/media/`,
      ),
    enabled: Boolean(assetId),
  });
}

export function useAddAssetMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      assetId,
      ...body
    }: {
      assetId: string;
      url: string;
      caption?: string;
      is_primary?: boolean;
    }) =>
      rentalRequest<RentalAssetMedia>(
        `/api/v1/rentals/partner/assets/${assetId}/media/`,
        jsonInit("POST", body),
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["rentals", "partner", "assets", variables.assetId, "media"],
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.rentals.assets() });
    },
  });
}
