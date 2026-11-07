// Ported from frontend/apps/customer/features/visit/queries.ts
import { ApiRequestError, getStableIdempotencyKey, request, type Schemas } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { EXPIRING_STATE, VOLATILE_STATE, boundedPoll, queryKeys } from "@vsolve/query/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toWindowsView, type WindowsView } from "@/features/booking/adapters";

export type Visit = Schemas["CustomerBooking"];
export type VisitStatus = Schemas["BookingStatusEnum"];
export type ScopeAmendment = Schemas["ScopeAmendment"];

const SETTLED_STATUSES: readonly VisitStatus[] = [
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "DISPUTED",
  "CANCELLED",
  "COMPLETION_SUBMITTED",
  "RECOVERY_REQUIRED",
];

export function isVisitSettled(visit: Visit): boolean {
  return SETTLED_STATUSES.includes(visit.status);
}

const TERMINAL_STATUSES: readonly VisitStatus[] = [
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "DISPUTED",
  "CANCELLED",
];

export function isVisitTerminal(visit: Visit): boolean {
  return TERMINAL_STATUSES.includes(visit.status);
}

const CANCELLABLE_STATUSES: readonly VisitStatus[] = [
  "CONFIRMED",
  "EN_ROUTE",
  "ARRIVED",
  "RECOVERY_REQUIRED",
];

export function canCancel(visit: Visit): boolean {
  return CANCELLABLE_STATUSES.includes(visit.status);
}

export function canReschedule(visit: Visit): boolean {
  return visit.reschedule_preview?.is_available ?? false;
}

export function rescheduleBlockedReason(visit: Visit): string {
  return visit.reschedule_preview?.unavailable_reason ?? "";
}

export function canRespondToCompletion(visit: Visit): boolean {
  return visit.status === "COMPLETION_SUBMITTED";
}

export function canRequestStartOtp(visit: Visit): boolean {
  return visit.status === "ARRIVED";
}

export function useVisit(bookingId: string | null) {
  return useQuery({
    queryKey: queryKeys.booking.visit(bookingId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/bookings/{booking_id}/", {
          params: { path: { booking_id: bookingId! } },
        }),
      ),
    enabled: bookingId !== null,
    ...EXPIRING_STATE,
    ...boundedPoll<Visit>({ isSettled: isVisitSettled }),
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && (error.status === 403 || error.status === 404)
        ? false
        : failureCount < 2,
  });
}

function visitCommandKey(action: string, bookingId: string, expectedVersion: number): string {
  return getStableIdempotencyKey(`visit-${action}:${bookingId}:${expectedVersion}`);
}

interface VersionedVisitInput {
  bookingId: string;
  expectedVersion: number;
}

function useVisitCommandCache() {
  const queryClient = useQueryClient();

  return {
    applyVisit(visit: Visit) {
      queryClient.setQueryData(queryKeys.booking.visit(visit.id), visit);
      void queryClient.invalidateQueries({ queryKey: queryKeys.booking.groups() });
    },
    refetchVisit(bookingId: string) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.booking.visit(bookingId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.booking.groups() });
    },
  };
}

export interface CancelVisitInput extends VersionedVisitInput {
  reason: string;
}

export function useCancelVisit() {
  const cache = useVisitCommandCache();

  return useMutation({
    mutationFn: (input: CancelVisitInput) =>
      request(() =>
        getApiClient().POST("/api/v1/bookings/{booking_id}/cancel/", {
          params: {
            path: { booking_id: input.bookingId },
            header: {
              "Idempotency-Key": visitCommandKey(
                "cancel",
                input.bookingId,
                input.expectedVersion,
              ),
            },
          },
          body: { expected_version: input.expectedVersion, reason: input.reason },
        }),
      ),
    onSuccess: (result) => cache.applyVisit(result.booking),
    onError: (_error, input) => cache.refetchVisit(input.bookingId),
    retry: false,
  });
}

export function useRescheduleWindows(bookingId: string | null) {
  return useQuery<WindowsView>({
    queryKey: queryKeys.booking.rescheduleWindows(bookingId ?? ""),
    queryFn: async () =>
      toWindowsView(
        await request(() =>
          getApiClient().GET("/api/v1/bookings/{booking_id}/reschedule-windows/", {
            params: { path: { booking_id: bookingId! } },
          }),
        ),
      ),
    enabled: bookingId !== null,
    ...VOLATILE_STATE,
  });
}

export interface RescheduleVisitInput extends VersionedVisitInput {
  newRequestedStart: string;
}

export function useRescheduleVisit() {
  const cache = useVisitCommandCache();

  return useMutation({
    mutationFn: (input: RescheduleVisitInput) =>
      request(() =>
        getApiClient().POST("/api/v1/bookings/{booking_id}/reschedule/", {
          params: {
            path: { booking_id: input.bookingId },
            header: {
              "Idempotency-Key": visitCommandKey(
                `reschedule:${input.newRequestedStart}`,
                input.bookingId,
                input.expectedVersion,
              ),
            },
          },
          body: {
            expected_version: input.expectedVersion,
            new_requested_start: input.newRequestedStart,
          },
        }),
      ),
    onSuccess: cache.applyVisit,
    onError: (_error, input) => cache.refetchVisit(input.bookingId),
    retry: false,
  });
}

export function useRequestStartOtp() {
  const cache = useVisitCommandCache();

  return useMutation({
    mutationFn: (input: VersionedVisitInput) =>
      request(() =>
        getApiClient().POST("/api/v1/bookings/{booking_id}/start-otp/", {
          params: { path: { booking_id: input.bookingId } },
          body: { expected_version: input.expectedVersion },
        }),
      ),
    onError: (_error, input) => cache.refetchVisit(input.bookingId),
    retry: false,
  });
}

export function useConfirmCompletion() {
  const cache = useVisitCommandCache();

  return useMutation({
    mutationFn: (input: VersionedVisitInput) =>
      request(() =>
        getApiClient().POST("/api/v1/bookings/{booking_id}/completion/confirm/", {
          params: {
            path: { booking_id: input.bookingId },
            header: {
              "Idempotency-Key": visitCommandKey(
                "confirm",
                input.bookingId,
                input.expectedVersion,
              ),
            },
          },
          body: { expected_version: input.expectedVersion },
        }),
      ),
    onSuccess: cache.applyVisit,
    onError: (_error, input) => cache.refetchVisit(input.bookingId),
    retry: false,
  });
}

export interface DisputeCompletionInput extends VersionedVisitInput {
  disputeReason: string;
  disputedOutcomeIds?: string[];
}

export function useDisputeCompletion() {
  const cache = useVisitCommandCache();

  return useMutation({
    mutationFn: (input: DisputeCompletionInput) =>
      request(() =>
        getApiClient().POST("/api/v1/bookings/{booking_id}/completion/dispute/", {
          params: {
            path: { booking_id: input.bookingId },
            header: {
              "Idempotency-Key": visitCommandKey(
                "dispute",
                input.bookingId,
                input.expectedVersion,
              ),
            },
          },
          body: {
            expected_version: input.expectedVersion,
            dispute_reason: input.disputeReason,
            ...(input.disputedOutcomeIds ? { disputed_outcome_ids: input.disputedOutcomeIds } : {}),
          },
        }),
      ),
    onSuccess: cache.applyVisit,
    onError: (_error, input) => cache.refetchVisit(input.bookingId),
    retry: false,
  });
}

export function useApproveAmendment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { amendmentId: string; bookingId: string }) =>
      request(() =>
        getApiClient().POST("/api/v1/scope-amendments/{amendment_id}/approve/", {
          params: {
            path: { amendment_id: input.amendmentId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `amendment-approve:${input.amendmentId}`,
              ),
            },
          },
        }),
      ),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.booking.visit(input.bookingId) });
    },
    retry: false,
  });
}

export function useDeclineAmendment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { amendmentId: string; bookingId: string }) =>
      request(() =>
        getApiClient().POST("/api/v1/scope-amendments/{amendment_id}/decline/", {
          params: {
            path: { amendment_id: input.amendmentId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `amendment-decline:${input.amendmentId}`,
              ),
            },
          },
        }),
      ),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.booking.visit(input.bookingId) });
    },
    retry: false,
  });
}

