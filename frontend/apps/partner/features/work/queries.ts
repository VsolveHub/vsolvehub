"use client";

import {
  ApiRequestError,
  getStableIdempotencyKey,
  request,
  serverClock,
  type Schemas,
} from "@vsolve/api-client";
import { EXPIRING_STATE, boundedPoll, queryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

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
 * The customer's exact address, map route and phone arrive on the visit itself,
 * but only from two hours before the start (contract 1.82.0). Until then the
 * server sends `null` and the locality alone; this module never derives either.
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

export type GatedAction = "MARK_EN_ROUTE" | "MARK_ARRIVED";

/** The status each clocked step moves on from. */
const GATED_FROM: Record<GatedAction, VisitStatus> = {
  MARK_EN_ROUTE: "CONFIRMED",
  MARK_ARRIVED: "EN_ROUTE",
};

/**
 * "On the way" and "Arrived" are clocked by the server (contract 1.82.0): on
 * the way from an hour before the start, arrived from half an hour before.
 * `allowed_actions` is the server's answer for the instant it was read, and it
 * is the only thing these read — Django refuses an early tap regardless, so a
 * client that guessed the window itself would only be wrong in public.
 */
export function canGoEnRoute(visit: PartnerVisit): boolean {
  return visit.status === "CONFIRMED" && visit.allowed_actions.includes("MARK_EN_ROUTE");
}

export function canArrive(visit: PartnerVisit): boolean {
  return visit.status === "EN_ROUTE" && visit.allowed_actions.includes("MARK_ARRIVED");
}

export interface WaitingGate {
  readonly action: GatedAction;
  /**
   * `not_yet`: opens at `opensAt`. `opening`: the window has started by the
   * calibrated clock but this read predates it — a refetch is due. `closed`:
   * the window ended at `closesAt`; only Operations can move the visit now.
   */
  readonly state: "not_yet" | "opening" | "closed";
  readonly opensAt: string;
  readonly closesAt: string;
}

/** The clocked step this visit is waiting on, when the server has not opened it. */
export function waitingGate(visit: PartnerVisit, serverNowMs: number): WaitingGate | null {
  for (const action of ["MARK_EN_ROUTE", "MARK_ARRIVED"] as const) {
    if (visit.status !== GATED_FROM[action] || visit.allowed_actions.includes(action)) continue;
    const opensAt =
      action === "MARK_EN_ROUTE" ? visit.gates.en_route_opens_at : visit.gates.arrival_opens_at;
    const closesAt =
      action === "MARK_EN_ROUTE" ? visit.gates.en_route_closes_at : visit.gates.arrival_closes_at;
    const state =
      serverNowMs > Date.parse(closesAt)
        ? "closed"
        : serverNowMs >= Date.parse(opensAt)
          ? "opening"
          : "not_yet";
    return { action, state, opensAt, closesAt };
  }
  return null;
}

/** Who the Partner is visiting, once the server discloses it; `null` before. */
export function visitContact(visit: PartnerVisit): { firstName: string; phone: string } | null {
  if (visit.customer_first_name === null || visit.customer_phone === null) return null;
  return { firstName: visit.customer_first_name, phone: visit.customer_phone };
}

/** setTimeout's ceiling; a visit is at most a week out, so this only guards. */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * Re-read the visit the moment its next window opens.
 *
 * The countdown is drawn from the server's published instants, but whether the
 * step is open is the server's call — so when the clock reaches `opensAt` (or
 * the address unlock), this asks again rather than flipping a button locally.
 */
export function useRefreshVisitAtGates(visit: PartnerVisit): void {
  const queryClient = useQueryClient();
  const refetchedFor = useRef<string | null>(null);

  useEffect(() => {
    const refresh = () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.partnerWork.visit(visit.id) });
    const now = serverClock.now();
    const gate = waitingGate(visit, now);
    const instants = [
      gate?.state === "not_yet" ? gate.opensAt : null,
      visit.site_address === null && !isSettled(visit) ? visit.gates.address_unlocks_at : null,
    ]
      .filter((instant): instant is string => instant !== null)
      .map((instant) => Date.parse(instant))
      .filter((at) => Number.isFinite(at) && at > now);

    // Opened by the clock but not by this read: ask once per version, not in a loop.
    const staleKey = `${visit.id}:${visit.version}`;
    if (gate?.state === "opening" && refetchedFor.current !== staleKey) {
      refetchedFor.current = staleKey;
      refresh();
    }
    if (instants.length === 0) return undefined;
    const delay = Math.min(Math.min(...instants) - now + 1_000, MAX_TIMER_MS);
    const timer = setTimeout(refresh, delay);
    return () => clearTimeout(timer);
  }, [queryClient, visit]);
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

/**
 * The shelves a Partner actually thinks in, plus the unfiltered read.
 *
 * `"all"` omits the `bucket` parameter, which Django treats as "no status or
 * date filter at all" — every booking this Partner owns. It exists because the
 * three named shelves together do **not** cover the Partner's own work, and the
 * gap swallows live jobs:
 *
 * `active` is `status NOT IN (terminal) AND scheduled_start ∈ [today, today+2d)`
 * (`apps/fulfilment/views/partner.py`). The upper bound is deliberate — a
 * booking three weeks out is not a task. The **lower** bound is the problem: a
 * job that started before today and has not finished sorts below the window and
 * disappears. Measured against the seeded database on 26 Aug 2026, four of ten
 * bookings were in neither `active` nor `completed`:
 *
 *   Demo Partner 3  ARRIVED      30 Aug  — partner on site, job not in their app
 *   Demo Partner 4  IN_PROGRESS  24 Aug  — started two days ago, still running
 *   Demo Partner 1  CONFIRMED    30 Aug  — confirmed work, invisible until the 29th
 *   Demo Partner 10 CANCELLED    27 Aug  — only in `cancelled`, which nothing reads
 *
 * The first two are the serious ones: a Partner who is mid-job cannot open it to
 * mark arrival or file completion, while the Customer app shows the same booking
 * as `ARRIVED`/`IN_PROGRESS` with that Partner named.
 *
 * Fixing the window is a backend change and is written up separately; `"all"`
 * is what makes the app correct in the meantime, and it is correct on its own
 * terms — `fromWorkItems` already decides which statuses are work, so the client
 * was never relying on the server's date filter for anything but payload size.
 */
export type JobBucket = "active" | "completed" | "cancelled" | "all";

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
            // `all` means "send no filter". Django reads `bucket` with
            // `.get("bucket")` and applies nothing when it is absent, so the
            // parameter is omitted rather than sent as an empty string — which
            // the query serializer would reject as an invalid choice.
            params: { query: bucket === "all" ? {} : { bucket } },
          }),
        )
      ).results,
    ...EXPIRING_STATE,
  });
}
