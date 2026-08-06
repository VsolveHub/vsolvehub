"use client";

import { ApiRequestError, getStableIdempotencyKey, request, type Schemas } from "@vsolve/api-client";
import { EXPIRING_STATE, boundedPoll, queryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The Partner's side of one visit (contract 1.16.0).
 *
 * ## What this deliberately cannot reach
 *
 * There is no Booking Group here, and no order. The published `PartnerBooking`
 * projection carries neither `booking_group_id` nor `order_id`, so there is no
 * identifier with which to ask about a sibling unit even if this code wanted to
 * — which is the point. `G7` requires that a Partner cannot see another
 * Partner's scope or earnings, and absence is a stronger guarantee than a filter.
 *
 * The customer's exact address is likewise not here. It arrives through the
 * offer disclosure gate, not through the work surface.
 *
 * ## Release is offered without a threat attached
 *
 * `01-scope-and-flow.md` is explicit that M1 records a late release for manual
 * Operations review only. There is no score, no warning copy and nothing that
 * implies a consequence, because none exists — inventing one in the UI would be
 * a product decision made by a component.
 *
 * ## Commands never auto-retry
 *
 * Every one is idempotent under a version-carrying key, which makes a *deliberate*
 * replay safe. Automatic retry is a different thing: it would fire on an
 * ambiguous failure the Partner has not seen, and the honest response to "we do
 * not know whether that landed" is to re-read and say so.
 */

export type PartnerVisit = Schemas["PartnerBooking"];
export type VisitStatus = Schemas["BookingStatusEnum"];
export type WorkTask = Schemas["WorkTask"];

const SETTLED_STATUSES: readonly VisitStatus[] = [
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "DISPUTED",
  "CANCELLED",
  "COMPLETION_SUBMITTED",
  "RECOVERY_REQUIRED",
];

export function isSettled(visit: PartnerVisit): boolean {
  return SETTLED_STATUSES.includes(visit.status);
}

export function canGoEnRoute(visit: PartnerVisit): boolean {
  return visit.status === "CONFIRMED";
}

export function canArrive(visit: PartnerVisit): boolean {
  return visit.status === "EN_ROUTE";
}

/** The Partner is on site and work has not begun: the OTP is the next step. */
export function canStartWork(visit: PartnerVisit): boolean {
  return visit.status === "ARRIVED";
}

export function canReportCompletion(visit: PartnerVisit): boolean {
  return visit.status === "IN_PROGRESS" || visit.status === "ABORTED";
}

export function canAbort(visit: PartnerVisit): boolean {
  return visit.status === "IN_PROGRESS";
}

/** Handing the job back is available right up to the point work starts. */
export function canRelease(visit: PartnerVisit): boolean {
  return visit.status === "CONFIRMED" || visit.status === "EN_ROUTE" || visit.status === "ARRIVED";
}

export function usePartnerVisit(bookingId: string | null) {
  return useQuery({
    queryKey: queryKeys.partnerWork.visit(bookingId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/partner/bookings/{booking_id}/", {
          params: { path: { booking_id: bookingId! } },
        }),
      ),
    enabled: bookingId !== null,
    ...EXPIRING_STATE,
    ...boundedPoll<PartnerVisit>({ isSettled }),
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && (error.status === 403 || error.status === 404)
        ? false
        : failureCount < 2,
  });
}

function workCommandKey(action: string, bookingId: string, expectedVersion: number): string {
  return getStableIdempotencyKey(`partner-work-${action}:${bookingId}:${expectedVersion}`);
}

interface VersionedInput {
  bookingId: string;
  expectedVersion: number;
}

function useWorkCommandCache() {
  const queryClient = useQueryClient();

  return {
    apply(visit: PartnerVisit) {
      queryClient.setQueryData(queryKeys.partnerWork.visit(visit.id), visit);
      // The offer inbox shows what the Partner is committed to, so a visit
      // reaching a terminal state changes it. Invalidated, never written: this
      // response is one visit and knows nothing about the rest of the inbox.
      void queryClient.invalidateQueries({ queryKey: queryKeys.partner.offers() });
    },
    refetch(bookingId: string) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.partnerWork.visit(bookingId) });
    },
  };
}

/**
 * One factory for the four commands whose body is only a version.
 *
 * En route, arrived, customer-unavailable and start-OTP-verify differ in their
 * path and nothing else. Four near-identical hooks would be four places for the
 * key convention or the error handling to drift.
 */
function useSimpleWorkCommand(
  path:
    | "/api/v1/partner/bookings/{booking_id}/en-route/"
    | "/api/v1/partner/bookings/{booking_id}/arrived/"
    | "/api/v1/partner/bookings/{booking_id}/customer-unavailable/",
  action: string,
) {
  const cache = useWorkCommandCache();

  return useMutation({
    mutationFn: (input: VersionedInput) =>
      request(() =>
        getApiClient().POST(path, {
          params: {
            path: { booking_id: input.bookingId },
            header: {
              "Idempotency-Key": workCommandKey(action, input.bookingId, input.expectedVersion),
            },
          },
          body: { expected_version: input.expectedVersion },
        }),
      ),
    onSuccess: cache.apply,
    onError: (_error, input) => cache.refetch(input.bookingId),
    retry: false,
  });
}

export function useMarkEnRoute() {
  return useSimpleWorkCommand("/api/v1/partner/bookings/{booking_id}/en-route/", "en-route");
}

export function useMarkArrived() {
  return useSimpleWorkCommand("/api/v1/partner/bookings/{booking_id}/arrived/", "arrived");
}

export function useMarkCustomerUnavailable() {
  return useSimpleWorkCommand(
    "/api/v1/partner/bookings/{booking_id}/customer-unavailable/",
    "customer-unavailable",
  );
}

export interface VerifyStartOtpInput extends VersionedInput {
  code: string;
}

/**
 * The code the customer read out, typed in by the Partner.
 *
 * The key carries the code as well as the version: a corrected retype is a
 * different command, and reusing the failed attempt's key would have Django
 * replay the refusal instead of checking the new code.
 */
export function useVerifyStartOtp() {
  const cache = useWorkCommandCache();

  return useMutation({
    mutationFn: (input: VerifyStartOtpInput) =>
      request(() =>
        getApiClient().POST("/api/v1/partner/bookings/{booking_id}/start-otp/verify/", {
          params: {
            path: { booking_id: input.bookingId },
            header: {
              "Idempotency-Key": workCommandKey(
                `otp:${input.code}`,
                input.bookingId,
                input.expectedVersion,
              ),
            },
          },
          body: { expected_version: input.expectedVersion, code: input.code },
        }),
      ),
    onSuccess: cache.apply,
    onError: (_error, input) => cache.refetch(input.bookingId),
    retry: false,
  });
}

export interface ReasonedInput extends VersionedInput {
  reason: string;
}

function useReasonedWorkCommand(
  path:
    | "/api/v1/partner/bookings/{booking_id}/abort/"
    | "/api/v1/partner/bookings/{booking_id}/release/",
  action: string,
) {
  const cache = useWorkCommandCache();

  return useMutation({
    mutationFn: (input: ReasonedInput) =>
      request(() =>
        getApiClient().POST(path, {
          params: {
            path: { booking_id: input.bookingId },
            header: {
              "Idempotency-Key": workCommandKey(action, input.bookingId, input.expectedVersion),
            },
          },
          body: { expected_version: input.expectedVersion, reason: input.reason },
        }),
      ),
    onSuccess: cache.apply,
    onError: (_error, input) => cache.refetch(input.bookingId),
    retry: false,
  });
}

export function useAbortWork() {
  return useReasonedWorkCommand("/api/v1/partner/bookings/{booking_id}/abort/", "abort");
}

export function useReleaseBooking() {
  return useReasonedWorkCommand("/api/v1/partner/bookings/{booking_id}/release/", "release");
}

/** The published request shape. `quantity` and `reason` are required by the contract —
 * a report that omitted them would be a report Django has to guess at. */
export type OutcomeInput = Schemas["OutcomeInputRequest"];

export interface SubmitCompletionInput extends VersionedInput {
  notes: string;
  safetyDamageDeclared: boolean;
  outcomes: OutcomeInput[];
}

/**
 * The completion report: one outcome per task, every task named.
 *
 * Django settles money from these outcomes — an unperformed line is refunded —
 * so a report that silently omitted a task would refund nothing for work that
 * never happened. The form must send every task, which is why the request
 * serializer rejects an empty list rather than treating it as "nothing to say".
 */
export function useSubmitCompletion() {
  const cache = useWorkCommandCache();

  return useMutation({
    mutationFn: (input: SubmitCompletionInput) =>
      request(() =>
        getApiClient().POST("/api/v1/partner/bookings/{booking_id}/completion/", {
          params: {
            path: { booking_id: input.bookingId },
            header: {
              "Idempotency-Key": workCommandKey(
                "completion",
                input.bookingId,
                input.expectedVersion,
              ),
            },
          },
          body: {
            expected_version: input.expectedVersion,
            notes: input.notes,
            safety_damage_declared: input.safetyDamageDeclared,
            outcomes: input.outcomes,
          },
        }),
      ),
    onSuccess: cache.apply,
    onError: (_error, input) => cache.refetch(input.bookingId),
    retry: false,
  });
}

export interface ProposeAmendmentInput extends VersionedInput {
  reason: string;
  taskQuantity: number;
}

export function useProposeAmendment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ProposeAmendmentInput) =>
      request(() =>
        getApiClient().POST("/api/v1/partner/bookings/{booking_id}/scope-amendments/", {
          params: {
            path: { booking_id: input.bookingId },
            header: {
              "Idempotency-Key": workCommandKey(
                "amendment",
                input.bookingId,
                input.expectedVersion,
              ),
            },
          },
          body: {
            expected_version: input.expectedVersion,
            reason: input.reason,
            task_quantity: input.taskQuantity,
          },
        }),
      ),
    onSuccess: (_amendment, input) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.partnerWork.visit(input.bookingId),
      });
    },
    retry: false,
  });
}

/* -------------------------------------------------------------------------
   The job list (contract 1.19.0)
   ------------------------------------------------------------------------- */

/** The shelves a Partner actually thinks in. Django owns the status mapping. */
export type JobBucket = "active" | "completed" | "cancelled";

/**
 * The Partner's own work, as a list.
 *
 * This did not exist before 1.19.0, which is why the app had no job list: the
 * only published read was `GET /partner/bookings/{id}/`, and there was no screen
 * that could produce an id to call it with.
 *
 * Buckets rather than raw statuses. Eleven `BookingStatusEnum` values are a
 * domain detail; "what do I have to do", "what did I finish" and "what fell
 * through" are the three questions a Partner actually asks. The mapping is the
 * server's, so the app cannot invent a shelf the queue does not honour.
 */
export function usePartnerJobs(bucket: JobBucket) {
  return useQuery({
    queryKey: queryKeys.partnerWork.bookings(bucket),
    queryFn: async () =>
      (
        await request(() =>
          getApiClient().GET("/api/v1/partner/bookings/", {
            params: { query: { bucket } },
          }),
        )
      ).results,
    ...EXPIRING_STATE,
  });
}
