"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getStableIdempotencyKey, request } from "@vsolve/api-client";
import {
  M2_FRESHNESS,
  invalidateForM2Command,
  m2QueryKeys,
  shouldRetryM2Read,
  type AttendanceResponse,
  type CashDemandReport,
  type DaySettlement,
  type DisputedWorker,
  type ShiftAttendance,
  type ShiftDay,
  type ShortfallChoice,
} from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The Customer's evening — `M2-FE-510`, `514`, `515`, contract 1.30.0.
 *
 * One read and three commands: confirm or dispute who turned up, tap that the
 * day was settled, and report a cash extra demanded on site. The durable,
 * React-free half is the shift-day section of
 * `packages/query/src/m2-engagement-customer.ts`; this file is its call site,
 * the same split every other M2 feature in this app uses.
 *
 * ## One read, because it is one evening
 *
 * `GET /engagement-stages/{id}/shift/` returns the crew, the attendance and the
 * settlement together. The server's own reasoning for that is the reason there
 * is one query key here rather than three: the crew screen, the attendance
 * screen and the settlement screen are the same screen at three moments, and
 * separate caches would let them disagree about which day the Customer is
 * looking at.
 *
 * ## Why nothing here polls
 *
 * Every transition on a shift-day is **a person acting**: a supervisor recording
 * `n of m`, the other party tapping settled. That happens on the scale of an
 * evening, not of seconds, and a timer on it would be a timer on somebody else's
 * hands. `M2_FRESHNESS.attendance` is `EXPIRING_STATE`, which gives the refetch
 * that actually matters — the one when the Customer comes back to look. Same
 * decision `useStage` takes for the review clock, and for the same reason.
 *
 * There is no `boundedPoll` anywhere in this file on purpose. Contrast
 * `features/crew/queries.ts`, which does poll: a booking fee settles on a
 * verified provider callback in minutes while the Customer sits on the screen.
 * **No money is in flight here at all** — A3 wages are peer-to-peer and the
 * platform never holds them — so there is nothing a clock could be waiting for.
 *
 * ## Every command invalidates through the published table
 *
 * `respond_attendance`, `confirm_day_settled` and `report_cash_demand` are all
 * rows in `M2_INVALIDATION`, and all three resolve to `stageScope`, which since
 * the Gate 1 fix returns `[engagements.detail(id), engagements.all]`. That
 * reaches the shift-day key (nested under the stage, under the detail), the
 * engagement's own record and the list buckets. Calling
 * `invalidateForM2Command` rather than naming keys here is what keeps the table
 * a true description of the commands instead of documentation beside the code.
 */

export type { ShiftDay, ShiftAttendance, DaySettlement, CashDemandReport };

/* --------------------------------------------------------------------------
   The read
   -------------------------------------------------------------------------- */

/**
 * One shift-day, whole — `M2-FE-510`, `514`.
 *
 * `enabled` exists because the endpoint is A3-only: a project milestone has no
 * crew, no attendance and no daily settlement, and the server says so with
 * `409 m2_stage_transition_not_allowed`. Mounting this on an A5 stage would put
 * a refusal behind every project stage review, and an ignored refusal is where
 * a real one hides. The caller passes the engagement's own `commercial_mode`
 * verdict rather than anything derived here.
 *
 * A `404` is not retried — object-level authorization answers `404` wherever
 * existence is private, so it means "gone, or never yours" and neither becomes
 * true on a second attempt. `shouldRetryM2Read` is what encodes that.
 */
export function useShiftDay(engagementId: string, stageId: string | null, enabled = true) {
  return useQuery({
    queryKey: m2QueryKeys.shiftDays.forStage(engagementId, stageId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/engagement-stages/{stage_id}/shift/", {
          params: { path: { stage_id: stageId! } },
        }),
      ),
    enabled: stageId !== null && enabled,
    // The attendance tier: `EXPIRING_STATE`. A shift-day carries the same review
    // clock its stage does — silence approves the day when the window closes —
    // so serving one stale is serving a decision that may already be gone.
    ...M2_FRESHNESS.attendance,
    retry: shouldRetryM2Read,
  });
}

/* --------------------------------------------------------------------------
   Confirm or dispute the day — `M2-FE-510`
   -------------------------------------------------------------------------- */

export interface AttendanceResponseInput {
  /** Only so the engagement, its stages and the list can be refetched. */
  engagementId: string;
  stageId: string;
  response: AttendanceResponse;
  /**
   * Required by the server whenever workers are missing, and `""` otherwise.
   *
   * Sent on every call rather than omitted on a confirm, because the field is
   * published as `ShortfallChoiceEnum | BlankEnum` — a blank is a real value on
   * this wire and not an absence.
   */
  shortfallChoice: ShortfallChoice | "";
  /** Populated on a dispute and empty on a confirm. See below. */
  workerDetails: readonly DisputedWorker[];
  note: string;
}

/**
 * The Customer's one tap on the supervisor's count — `M2-FE-510`.
 *
 * **Confirming is one tap.** It approves the shift-day on the shared spine,
 * which on a workforce engagement also releases it — there is no payout to hold
 * because Vsolve collected nothing.
 *
 * **Per-worker detail is captured only on a dispute**, and that is a rule about
 * what data exists rather than a preference about forms. C4 deliberately has no
 * per-worker check-in and no per-worker check-out: the workers mostly do not
 * carry smartphones, the supervisor does, and a per-worker attendance product
 * would be a device dependency this market cannot meet. A routine Customer form
 * asking who was there would be inventing a record the server does not hold.
 * On a dispute the detail is the **Customer's account** — evidence in a case,
 * never a second attendance record — and nothing derives a count from it.
 *
 * ## The key carries the decision
 *
 * `execute_idempotent` fingerprints `{stage_id, response}`, so a key reused
 * across a changed mind would be refused as key reuse with a different payload.
 * Scoping the stored key by the response means a dropped connection replays the
 * *same* decision — which is the whole point of a stable key — while a Customer
 * who abandons a half-written dispute and confirms instead sends a genuinely new
 * command and gets the server's own state machine as the answer.
 *
 * No auto-retry. `409 m2_stage_transition_not_allowed` means the supervisor has
 * not recorded the day, or a shortfall was left without a choice, or the day was
 * already answered — all three are re-reads rather than resends.
 */
export function useRespondToAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AttendanceResponseInput) =>
      request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/attendance/response/", {
          params: {
            path: { stage_id: input.stageId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-attendance-response:${input.stageId}:${input.response}`,
              ),
            },
          },
          body: {
            response: input.response,
            shortfall_choice: input.shortfallChoice,
            worker_details: [...input.workerDetails],
            note: input.note,
          },
        }),
      ),
    // Success and refusal alike. A confirm approves the stage and creates the
    // settlement; a dispute stops the review clock and opens the Operations
    // path; a refusal means the day moved under the screen. All three leave the
    // cached engagement describing a state that is no longer there.
    onSettled: (_data, _error, input) =>
      void invalidateForM2Command(queryClient, "respond_attendance", {
        engagementId: input.engagementId,
        stageId: input.stageId,
      }),
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   The evening "Day settled?" tap — `M2-FE-514`
   -------------------------------------------------------------------------- */

export interface ConfirmDaySettledInput {
  engagementId: string;
  stageId: string;
}

/**
 * Records that this day was settled — the Customer's half of a **dual** tap.
 *
 * **No money moves here and none can.** A3 wages are direct, daily and
 * peer-to-peer at day end; the platform never holds them, no endpoint in this
 * contract can move one, and the screen calling this says so in as many words.
 * What the command does is record *who tapped*, and nothing else.
 *
 * A one-sided tap is left standing as `CUSTOMER_CLAIMED`, which is what
 * Operations reads as **unproven** — one person says they settled and the other
 * has not answered, which is a different sentence from either "they were paid"
 * or "they were not". Only both taps make `SETTLED`, and the amount freezes
 * there. Session B builds the supervisor's half (`M2-FE-513`).
 *
 * ## The response is the only place the UPI link is populated
 *
 * `DaySettlementSerializer` declares `upi_payment_link` as an `allow_null` field
 * over a model attribute that does not exist, and only this command's view
 * injects the real value — so the shift-day **read** always answers `null` for
 * it. Logged in `frontend-execution-plan.md` §7. Until that lands, the returned
 * settlement on `mutation.data` is the one place a live link can be found, and
 * the panel prefers it over the read for exactly that reason. **Nothing here
 * assembles a `upi://pay` string**: a link this client built is a link this
 * client can build wrong, and the failure mode is money reaching the wrong VPA.
 *
 * Keyed on the stage — one day is settled once by one party — so a double press
 * and a dropped connection both land on the same tap.
 */
export function useConfirmDaySettled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ConfirmDaySettledInput) =>
      request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/settlement/", {
          params: {
            path: { stage_id: input.stageId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(`m2-day-settled:${input.stageId}`),
            },
          },
        }),
      ),
    onSettled: (_data, _error, input) =>
      void invalidateForM2Command(queryClient, "confirm_day_settled", {
        engagementId: input.engagementId,
        stageId: input.stageId,
      }),
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   "They asked for extra in cash" — `M2-FE-515`
   -------------------------------------------------------------------------- */

export interface ReportCashDemandInput {
  engagementId: string;
  /** The day it happened on, when the Customer is looking at one. Optional. */
  stageId: string | null;
  /**
   * What they asked for, in integer paise, or null.
   *
   * Optional on the wire on purpose: a required amount turns "they demanded
   * extra" into a form, and the form is what stops it being reported.
   */
  amountClaimedPaise: number | null;
  note: string;
}

/**
 * Reports a cash extra demanded on site — `M2-FE-515`. One tap.
 *
 * **This promises the Customer nothing the server does not commit to.** The
 * report is recorded immutably and a standing event is written against the lead
 * — a fact with a date, not a penalty and not a score. If the owner has
 * configured a removal threshold and a window and this vendor has crossed it,
 * their A3 capability is suspended through the same command Operations uses.
 * While the threshold is unset **nothing at all happens to the vendor** and the
 * reports still accumulate, so the screen says the report is recorded and never
 * that anybody will be removed.
 *
 * Genuine extras are a different thing entirely and have their own route: the
 * amendment panel, priced at the card's published add-on rates by the server.
 * A vendor who names a number on site is the thing ADR-0009 exists to leave
 * nowhere to live.
 *
 * ## Idempotency is scoped to the day
 *
 * `execute_idempotent` fingerprints `{engagement_id}` alone, so the *key* is
 * what separates one report from the next. Scoped to engagement + day: a double
 * tap on Tuesday replays Tuesday's report rather than counting the same
 * complaint twice against a threshold that can end somebody's trade, and
 * Wednesday's is a genuinely new report under a new key.
 */
export function useReportCashDemand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReportCashDemandInput) =>
      request(() =>
        getApiClient().POST("/api/v1/engagements/{engagement_id}/cash-demand/", {
          params: {
            path: { engagement_id: input.engagementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-cash-demand:${input.engagementId}:${input.stageId ?? "engagement"}`,
              ),
            },
          },
          body: {
            amount_claimed_paise: input.amountClaimedPaise,
            note: input.note,
            stage_id: input.stageId,
          },
        }),
      ),
    onSettled: (_data, _error, input) =>
      void invalidateForM2Command(queryClient, "report_cash_demand", {
        engagementId: input.engagementId,
        ...(input.stageId === null ? {} : { stageId: input.stageId }),
      }),
    retry: false,
  });
}
