"use client";

import { ApiRequestError, getStableIdempotencyKey, request, type Schemas } from "@vsolve/api-client";
import { EXPIRING_STATE, VOLATILE_STATE, boundedPoll, queryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toWindowsView, type WindowsView } from "@/features/booking/adapters";
import { getApiClient } from "@/lib/api/browser";

/**
 * The customer's live visit: arrival through completion (contract 1.16.0).
 *
 * ## Every action here is one the server offered
 *
 * The temptation with a state machine this rich is to compute what the customer
 * may do from the status they can see — `ARRIVED` means show Confirm, `EN_ROUTE`
 * means show Cancel. That is a second implementation of `ALLOWED_TRANSITIONS`
 * plus the cancellation fee ladder plus the reschedule notice rule, living in a
 * browser, and the first time it disagrees with Django the customer is offered a
 * button that returns 400.
 *
 * So this module asks Django and renders the answer. `canCancel` and
 * `canReschedule` below read the *status*, which is genuinely the client's to
 * read, and the server still refuses anything they get wrong — they decide which
 * honest screen to show, never whether the command is permitted.
 *
 * ## Idempotency keys carry the version
 *
 * Same rule the group cancellation established: pressing En route twice for one
 * visit at one version is the same command and must replay; pressing it again
 * after the visit moved is a different command against a different world. A key
 * without the version would make Django answer `idempotency_key_reused` instead
 * of doing the work.
 *
 * ## Polling stops when only a person can move things
 *
 * A visit in `IN_PROGRESS` is being worked on and the server will move it. A
 * visit in `COMPLETION_SUBMITTED` is waiting for the customer to press a button,
 * and re-reading it on a timer asks the server a question only the customer can
 * answer.
 */

export type Visit = Schemas["CustomerBooking"];
export type VisitStatus = Schemas["BookingStatusEnum"];
export type ScopeAmendment = Schemas["ScopeAmendment"];

/**
 * Nothing further will happen to this visit without someone acting.
 *
 * `COMPLETION_SUBMITTED` is settled *for polling purposes* while being far from
 * finished: the ball is in the customer's court, and the auto-finalize watchdog
 * that eventually moves it runs a day out, not on a five-second timer.
 */
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

/** Truly over: no command, watchdog or person will move it again. */
const TERMINAL_STATUSES: readonly VisitStatus[] = [
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "DISPUTED",
  "CANCELLED",
];

export function isVisitTerminal(visit: Visit): boolean {
  return TERMINAL_STATUSES.includes(visit.status);
}

/**
 * Whether to offer Cancel at all.
 *
 * Mirrors `CUSTOMER_CANCELLABLE_STATUSES`, and is allowed to be wrong in exactly
 * one direction: offering it when Django will refuse costs the customer a typed
 * error, while hiding it when Django would allow it strands them. The server
 * decides; this only picks the screen.
 *
 * `RECOVERY_REQUIRED` is included because a customer whose Partner released
 * before the visit must be able to leave rather than wait for a replacement.
 * Django adds the condition this cannot see — a release *mid-job* leaves
 * performed work to settle — and refuses those.
 */
const CANCELLABLE_STATUSES: readonly VisitStatus[] = [
  "CONFIRMED",
  "EN_ROUTE",
  "ARRIVED",
  "RECOVERY_REQUIRED",
];

export function canCancel(visit: Visit): boolean {
  return CANCELLABLE_STATUSES.includes(visit.status);
}

/**
 * Whether to offer Reschedule — the server's answer, not a guess from the status.
 *
 * This is the one control on this screen that the client genuinely cannot decide. The rule is
 * not "has it started": Django also refuses a reschedule once the visit is inside its
 * *fee-bearing* cancellation band, read from the frozen quote-time ladder that never leaves the
 * server. A visit fourteen hours out is `CONFIRMED` and unmovable, and a client reading the
 * status alone offered a slot picker in which every single slot would be refused.
 *
 * So the whole decision comes from `reschedule_preview`, along with the sentence to show when
 * the answer is no.
 */
export function canReschedule(visit: Visit): boolean {
  return visit.reschedule_preview?.is_available ?? false;
}

/** Why Reschedule is not on offer. Empty when it is. */
export function rescheduleBlockedReason(visit: Visit): string {
  return visit.reschedule_preview?.unavailable_reason ?? "";
}

export function canRespondToCompletion(visit: Visit): boolean {
  return visit.status === "COMPLETION_SUBMITTED";
}

/** The start OTP is only meaningful once the Partner is standing there. */
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
    // Django answers 403 for both "not yours" and "does not exist" on purpose,
    // so neither is worth retrying — the next attempt gets the same answer.
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

/**
 * Shared cache handling for every command that returns the whole visit.
 *
 * The response *is* the new truth, so it replaces the cache rather than
 * triggering a refetch. The group list is invalidated because a visit reaching a
 * terminal state can settle its whole group — but only invalidated, never
 * written: this response knows nothing about sibling units.
 *
 * A refused command usually means the visit moved under the customer, and the
 * group read carries that same visit's status, so both are re-read.
 */
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
    // A 409 means the visit moved while the customer was deciding. Re-reading is
    // what lets them decide again against what is actually true now.
    onError: (_error, input) => cache.refetchVisit(input.bookingId),
    retry: false,
  });
}

/**
 * The slots this visit could move to — the same grid the customer chose from at checkout.
 *
 * Django builds both from one `build_arrival_window_grid`, so the times, widths, day range and
 * unavailable reasons are identical by construction rather than by two implementations
 * agreeing. What this one additionally knows is that the visit exists: it is scoped to the
 * booked Fulfilment Unit, it discounts the visit's own reservation so it does not block itself,
 * and it marks slots inside the minimum-notice window `TOO_SOON` instead of offering times the
 * reschedule command would refuse.
 *
 * `VOLATILE_STATE`, for the same reason as the checkout grid: a cached list of open times is a
 * claim the server has stopped standing behind.
 */
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

/**
 * Asks for the code the Partner will need.
 *
 * Not idempotent and deliberately not keyed: each request retires the previous
 * challenge and mints a new one, which is what "Resend" has to mean. Django
 * throttles it per booking, so a customer pressing it repeatedly gets a typed
 * `429` rather than an unbounded stream of codes.
 *
 * A refusal is re-read rather than left on screen: the commonest one is a page
 * that missed the Partner starting work, and the fix for that is the new status.
 */
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

/**
 * Approving extra work is a payment decision, not a checkbox.
 *
 * Django mints the `PaymentAttempt` inside the approval transaction, so the
 * response carries the attempt the customer must now pay. Reporting approval as
 * finished without surfacing that would tell them the work is authorized when it
 * is not yet paid for.
 */
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
