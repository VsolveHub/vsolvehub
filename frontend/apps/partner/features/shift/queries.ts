"use client";

import {
  ApiRequestError,
  clearIdempotencyKey,
  getStableIdempotencyKey,
  request,
  type Schemas,
} from "@vsolve/api-client";
import {
  M2_FRESHNESS,
  invalidateForM2Command,
  m2QueryKeys,
  type ShiftSafetyCategory,
  type ShiftSafetySeverity,
} from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { getApiClient } from "@/lib/api/browser";

/**
 * The A3 shift-day: one read and the supervisor's six commands
 * (contract 1.30.0).
 *
 * `M2-FE-502`..`M2-FE-508` and `M2-FE-513`. The rules live in `@vsolve/query`'s
 * `m2-engagement-partner`; this file is the wiring, on the same split
 * `features/engagement/queries.ts` uses.
 *
 * ## One read, not four
 *
 * `GET /engagement-stages/{id}/shift/` answers the crew, the attendance and the
 * settlement together, and `ShiftDaySerializer` says why: "the crew screen, the
 * attendance screen and the settlement screen are the same screen at three
 * moments of one evening, and four endpoints would let them disagree about which
 * day the user is looking at". So there is one hook here and every command below
 * settles into the same cache entry.
 *
 * `m2QueryKeys.shiftDays.forStage(engagementId, stageId)` landed at the Wave B3
 * gate for exactly that shape — one key per day, nested under
 * `engagements.stage`, so an engagement-wide invalidation reaches it and today's
 * `n of m` cannot reach yesterday's settled count.
 *
 * ## Every command is keyed, and none of them retries
 *
 * `retry: false` throughout. The refusals on this surface —
 * `m2_crew_conflict`, `m2_stage_transition_not_allowed`, `m2_amendment_required`,
 * `m2_policy_unavailable` — all mean *the record or the policy is not what this
 * screen believed*, and no automatic retry fixes any of them. A re-read does.
 *
 * The idempotency keys are scoped so that a **retry replays** and an **edit is a
 * new command**: `execute_idempotent` refuses a key reused with different
 * arguments, so a key scoped to the stage alone would turn a corrected count
 * into a fingerprint conflict. The two commands that carry no payload — arrival
 * and the settled tap — are scoped to the stage alone precisely because they
 * cannot be edited.
 *
 * ## What this file deliberately does not have
 *
 * No wage payment command, because there is no wage rail: A3 wages are direct,
 * daily and peer-to-peer at day end and the platform never holds them. No
 * per-worker check-in or check-out (`SIM-02`). No cancellation path dressed as a
 * safety report — a safety incident is a first-class record and never a reason
 * for ending a job.
 */

export type ShiftDay = Schemas["ShiftDay"];
export type ShiftAttendance = Schemas["ShiftAttendance"];
export type DaySettlement = Schemas["DaySettlement"];
export type StageCrewMember = Schemas["StageCrewMember"];
export type SafetyIncident = Schemas["SafetyIncident"];
export type SafetyIncidentList = Schemas["SafetyIncidentList"];

/* --------------------------------------------------------------------------
   Reads
   -------------------------------------------------------------------------- */

/**
 * One shift-day, whole.
 *
 * `M2_FRESHNESS.attendance` — `EXPIRING_STATE`. The day carries clocks the
 * client does not own: the Customer's review window runs against the recorded
 * count, and the retroactive overtime window closes on the server's own reckoning
 * of when the shift ended. A stale copy of this record is a screen offering
 * controls the server has already stopped accepting.
 *
 * **Not polled.** A shift-day moves when somebody standing on the site does
 * something, and the person most likely to do it is holding this screen. Focus
 * and reconnect revalidation carry the other party's half — a supervisor's phone
 * on a site's mobile connection is the wrong place to spend a request every
 * fifteen seconds.
 */
export function useShiftDay(engagementId: string, stageId: string, enabled = true) {
  return useQuery({
    queryKey: m2QueryKeys.shiftDays.forStage(engagementId, stageId),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/engagement-stages/{stage_id}/shift/", {
          params: { path: { stage_id: stageId } },
        }),
      ),
    enabled: enabled && engagementId !== "" && stageId !== "",
    ...M2_FRESHNESS.attendance,
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && [401, 403, 404, 409].includes(error.status)
        ? false
        : failureCount < 2,
  });
}

/**
 * The key the safety-incident list is read on.
 *
 * Composed under `engagements.detail`, which is where the events feed sat before
 * it was promoted and for the same reason: the incidents belong to the
 * engagement, so every engagement-level and stage-level invalidation clears them
 * by prefix — including `report_safety_incident`, whose scope is
 * `[engagements.detail, engagements.all]` since the Wave B3 gate. Promotion into
 * the factory is requested in `frontend-execution-plan.md` §7; the point of the
 * request is the name, not the shape.
 */
export function safetyIncidentsKey(engagementId: string) {
  return [...m2QueryKeys.engagements.detail(engagementId), "safety-incidents"] as const;
}

/**
 * Every safety report on this engagement, readable by both parties.
 *
 * Empty is the ordinary answer and the server returns `200` for it, so an empty
 * list is rendered as "nothing reported" rather than as a failure.
 */
export function useSafetyIncidents(engagementId: string, enabled = true) {
  return useQuery({
    queryKey: safetyIncidentsKey(engagementId),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/engagements/{engagement_id}/safety-incidents/", {
          params: { path: { engagement_id: engagementId } },
        }),
      ),
    enabled: enabled && engagementId !== "",
    ...M2_FRESHNESS.engagementDetail,
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && [401, 403, 404].includes(error.status)
        ? false
        : failureCount < 2,
  });
}

/* --------------------------------------------------------------------------
   Recovery
   -------------------------------------------------------------------------- */

/**
 * Re-reads instead of guessing.
 *
 * A failed command may or may not have applied — a timeout after Django
 * committed looks identical to one before it. The stable idempotency key is
 * deliberately **not** cleared here: clearing it would mint a new key on the
 * supervisor's own retry and turn one logical command into two, which on this
 * surface means two assignments or two counts.
 *
 * The prefix is the one `stageScope` returns, so this and the command table
 * cannot drift.
 */
function useRereadShiftDay(engagementId: string) {
  const queryClient = useQueryClient();

  return useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: m2QueryKeys.engagements.detail(engagementId),
    });
    void queryClient.invalidateQueries({ queryKey: m2QueryKeys.engagements.all });
  }, [engagementId, queryClient]);
}

export interface ShiftCommandScope {
  readonly engagementId: string;
  readonly stageId: string;
}

/* --------------------------------------------------------------------------
   `M2-FE-502` / `M2-FE-503` — who is on the day
   -------------------------------------------------------------------------- */

export interface AssignCrewInput {
  /** The **whole** intended crew, every time. See below. */
  readonly membershipIds: readonly string[];
  /** Why anybody currently on the day is coming off it. Stored against the release. */
  readonly reasonCode?: string;
}

/**
 * A stable operation id for one intended crew.
 *
 * Deterministic over exactly what reaches the body, and **order-insensitive**:
 * the server reconciles to a set, so two renders that tick the same four people
 * in a different order are one logical command and must share a key. An edited
 * set is a different command and gets its own, which is what makes a
 * substitution a fresh call rather than a fingerprint conflict against the
 * assignment it is replacing.
 */
function assignOperationId(stageId: string, input: AssignCrewInput): string {
  const ids = [...input.membershipIds].sort().join(",");
  return `m2-shift-crew:${stageId}:${ids}:${input.reasonCode ?? ""}`;
}

/**
 * Name the workers coming to one shift-day — `M2-FE-502`, and `M2-FE-503`'s
 * substitution is the same call.
 *
 * **Send the whole intended crew every time.** The server reconciles the day to
 * it: names that are gone are released with `reason_code`, new names are
 * assigned. That is why there is one mutation here and not an add and a remove —
 * a delete-then-add is a pair a client can half perform, and half of a
 * substitution is a shift-day whose crew list is a lie.
 *
 * Re-sending the same set is a no-op server-side, and the screen checks for that
 * before sending rather than after.
 */
export function useAssignShiftCrew(scope: ShiftCommandScope) {
  const queryClient = useQueryClient();
  const reread = useRereadShiftDay(scope.engagementId);

  return useMutation({
    mutationFn: (input: AssignCrewInput) =>
      request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/crew/", {
          params: {
            path: { stage_id: scope.stageId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                assignOperationId(scope.stageId, input),
              ),
            },
          },
          body: {
            membership_ids: [...input.membershipIds],
            reason_code: input.reasonCode ?? "",
          },
        }),
      ),
    onSuccess: async (_crew, input) => {
      clearIdempotencyKey(assignOperationId(scope.stageId, input));
      await invalidateForM2Command(queryClient, "assign_crew", scope);
    },
    onError: reread,
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   `M2-FE-504` — arrival, on the non-OTP path
   -------------------------------------------------------------------------- */

/**
 * Confirm the crew arrived.
 *
 * **Non-OTP is the default path in M2, not a fallback to apologise for.** The
 * start OTP is M3; today, on this platform, a person who was at the site says so
 * and that is how a shift starts. No screen wired to this may describe it as
 * degraded.
 *
 * Retry-safe in the strong sense: the key is scoped to the stage alone, because
 * the command carries no payload and therefore cannot be edited into a different
 * one, and the server is idempotent on its own state besides — an already-stamped
 * arrival returns the same record. Either party may record it.
 *
 * Three things happen server-side in one transaction and the screen must not
 * claim any of them before the answer lands: the arrival is stamped, the stage
 * starts on the shared spine, and **on day one the booking fee is earned**.
 *
 * There is no `confirm_shift_arrival` row in `M2Command`, so the invalidation is
 * hand-written to the prefix `stageScope` returns — requested in
 * `frontend-execution-plan.md` §7.
 */
export function useConfirmShiftArrival(scope: ShiftCommandScope) {
  const queryClient = useQueryClient();
  const reread = useRereadShiftDay(scope.engagementId);
  const operation = `m2-shift-arrival:${scope.stageId}`;

  return useMutation({
    mutationFn: () =>
      request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/arrival/", {
          params: {
            path: { stage_id: scope.stageId },
            header: { "Idempotency-Key": getStableIdempotencyKey(operation) },
          },
        }),
      ),
    onSuccess: async () => {
      clearIdempotencyKey(operation);
      await queryClient.invalidateQueries({
        queryKey: m2QueryKeys.engagements.detail(scope.engagementId),
      });
      await queryClient.invalidateQueries({ queryKey: m2QueryKeys.engagements.all });
    },
    onError: reread,
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   `M2-FE-505` — the supervisor's one action for the day
   -------------------------------------------------------------------------- */

export interface RecordAttendanceInput {
  readonly presentCount: number;
  /**
   * When the shift ended, ISO-8601, or `null`.
   *
   * Optional, and its absence is the point: a **missing check-out** settles at
   * the agreed shift length and is flagged for review, not disputed.
   */
  readonly shiftEndedAt: string | null;
}

function attendanceOperationId(stageId: string, input: RecordAttendanceInput): string {
  return `m2-shift-attendance:${stageId}:${input.presentCount}:${input.shiftEndedAt ?? ""}`;
}

/**
 * "n of m present today", in one action — `M2-FE-505`.
 *
 * There is deliberately **no per-worker check-in or check-out** anywhere in this
 * module and none may be added: `SIM-02` refuses it outright, because the workers
 * mostly do not carry smartphones and the supervisor does. Per-worker detail is
 * captured in exactly one place, a Customer's dispute, and it is captured there
 * by the Customer.
 *
 * The count *is* the evidence: the server writes it as the stage's submission,
 * hands the day to the Customer through the ordinary spine and starts the same
 * review clock every other stage runs on. So this one tap moves the engagement's
 * own state, which is why the whole command scope is invalidated rather than the
 * day alone.
 *
 * The key is scoped to the count and the end time, so a corrected count is a new
 * command and a double tap on the same number replays.
 */
export function useRecordShiftAttendance(scope: ShiftCommandScope) {
  const queryClient = useQueryClient();
  const reread = useRereadShiftDay(scope.engagementId);

  return useMutation({
    mutationFn: (input: RecordAttendanceInput) =>
      request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/attendance/", {
          params: {
            path: { stage_id: scope.stageId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                attendanceOperationId(scope.stageId, input),
              ),
            },
          },
          body: {
            present_count: input.presentCount,
            ...(input.shiftEndedAt === null ? {} : { shift_ended_at: input.shiftEndedAt }),
          },
        }),
      ),
    onSuccess: async (_attendance, input) => {
      clearIdempotencyKey(attendanceOperationId(scope.stageId, input));
      await invalidateForM2Command(queryClient, "confirm_attendance", scope);
    },
    onError: reread,
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   `M2-FE-506` — overtime and add-ons, priced by the server
   -------------------------------------------------------------------------- */

export interface ShiftExtraInput {
  readonly kind: Schemas["ShiftExtraKindEnum"];
  /** Overtime hours. Ignored for an add-on. */
  readonly hours: number;
  /** A code from the frozen card's own table. Ignored for overtime. */
  readonly addOnCode: string;
  /** Worker-days the add-on covers. Ignored for overtime. */
  readonly workerDays: number;
  readonly reason: string;
}

function extraOperationId(stageId: string, input: ShiftExtraInput): string {
  return [
    "m2-shift-extra",
    stageId,
    input.kind,
    input.hours,
    input.addOnCode,
    input.workerDays,
    input.reason.trim(),
  ].join(":");
}

/**
 * Ask the Customer to approve overtime or an add-on, at the card's **published**
 * rate — `M2-FE-506`.
 *
 * **There is no amount field and there never will be.** The vendor names what
 * and how much of it; the server names the money, from the card frozen on the
 * engagement at booking. A vendor who could type a number here could re-price a
 * job the Customer booked at a published rate, which is precisely the on-site
 * renegotiation ADR-0009 exists to leave nowhere to live. Nothing in this input
 * shape carries paise.
 *
 * This is a caller into the **one** amendment engine this codebase has — the
 * status machine, the expiry and the acceptance are the M1 engine's — so the
 * answer is an `EngagementAmendment` and its approval state is read on the
 * ordinary amendment list. `propose_amendment` is therefore the correct
 * invalidation row rather than a shift-day-shaped one.
 *
 * Two refusals the screen must keep apart: `m2_amendment_required` means this
 * booking publishes no such rate, or the retroactive window has already closed;
 * `m2_policy_unavailable` means the **owner has not set the window at all**, and
 * a retroactive request is refused rather than granted on a guess. Neither is
 * retried.
 */
export function useProposeShiftExtra(scope: ShiftCommandScope) {
  const queryClient = useQueryClient();
  const reread = useRereadShiftDay(scope.engagementId);

  return useMutation({
    mutationFn: (input: ShiftExtraInput) =>
      request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/extras/", {
          params: {
            path: { stage_id: scope.stageId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                extraOperationId(scope.stageId, input),
              ),
            },
          },
          body: {
            kind: input.kind,
            hours: input.hours,
            add_on_code: input.addOnCode,
            worker_days: input.workerDays,
            reason: input.reason.trim(),
          },
        }),
      ),
    onSuccess: async (_amendment, input) => {
      clearIdempotencyKey(extraOperationId(scope.stageId, input));
      await invalidateForM2Command(queryClient, "propose_amendment", {
        engagementId: scope.engagementId,
      });
      await queryClient.invalidateQueries({
        queryKey: m2QueryKeys.engagements.agreement(scope.engagementId),
      });
    },
    onError: reread,
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   `M2-FE-513` — the evening tap
   -------------------------------------------------------------------------- */

/**
 * Record that this day was settled.
 *
 * **No money moves here and none can.** A3 wages are direct, daily and
 * peer-to-peer at day end — the platform never holds them — so this command
 * records *who tapped* and nothing else. Settlement is per worker-day present
 * and never per job: a three-of-four day settles at three workers' published
 * rate, and the figure is the server's own `amount_paise`.
 *
 * A one-sided tap stays one-sided. `SUPERVISOR_CLAIMED` is what Operations reads
 * as **unproven** — one person says they settled and the other has not answered,
 * which is a different sentence from either "they were paid" or "they were not".
 * Only both taps make `SETTLED`, and the amount freezes there.
 *
 * Keyed on the stage alone: the tap carries no payload, so it cannot be edited
 * into a different command, and a second tap on a flaky connection must replay
 * rather than become a second claim.
 */
export function useConfirmDaySettled(scope: ShiftCommandScope) {
  const queryClient = useQueryClient();
  const reread = useRereadShiftDay(scope.engagementId);
  const operation = `m2-shift-settled:${scope.stageId}`;

  return useMutation({
    mutationFn: () =>
      request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/settlement/", {
          params: {
            path: { stage_id: scope.stageId },
            header: { "Idempotency-Key": getStableIdempotencyKey(operation) },
          },
        }),
      ),
    onSuccess: async () => {
      clearIdempotencyKey(operation);
      await invalidateForM2Command(queryClient, "confirm_day_settled", scope);
    },
    onError: reread,
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   `M2-FE-508` — safety
   -------------------------------------------------------------------------- */

export interface SafetyReportInput {
  readonly severity: ShiftSafetySeverity;
  readonly categoryCode: ShiftSafetyCategory;
  readonly description: string;
  /** ISO-8601, or `null` to let the server stamp it now. */
  readonly occurredAt: string | null;
  /** The shift-day it happened on, when there is one. */
  readonly stageId: string | null;
}

function safetyOperationId(engagementId: string, input: SafetyReportInput): string {
  return [
    "m2-safety",
    engagementId,
    input.stageId ?? "",
    input.severity,
    input.categoryCode,
    input.occurredAt ?? "",
    input.description.trim(),
  ].join(":");
}

/**
 * File a safety incident — `M2-FE-508`.
 *
 * **It is never a cancellation reason and this app never offers it as one.**
 * Nothing here cancels, suspends or refunds anything and the engagement carries
 * on exactly as it was. A job that has to end because a site is unsafe ends
 * through cancellation *with* a report beside it, so both facts exist separately
 * and either can be read without the other — filing "a worker fell" as "job
 * cancelled, site unsafe" is how a platform ends up unable to say, two years
 * later, what was reported and what was done about it.
 *
 * The report body is **frozen** once filed. Operations may add a status and a
 * resolution; nobody may rewrite what was reported. So the key is scoped to the
 * whole content: a double tap replays, and a genuinely different report is a
 * different record rather than an edit of the first.
 *
 * `reporter_role` is derived from the caller server-side and is deliberately not
 * in the request shape.
 */
export function useReportSafetyIncident(engagementId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SafetyReportInput) =>
      request(() =>
        getApiClient().POST("/api/v1/engagements/{engagement_id}/safety-incidents/", {
          params: {
            path: { engagement_id: engagementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                safetyOperationId(engagementId, input),
              ),
            },
          },
          body: {
            severity: input.severity,
            category_code: input.categoryCode,
            description: input.description.trim(),
            ...(input.occurredAt === null ? {} : { occurred_at: input.occurredAt }),
            ...(input.stageId === null ? {} : { stage_id: input.stageId }),
          },
        }),
      ),
    onSuccess: async (_incident, input) => {
      clearIdempotencyKey(safetyOperationId(engagementId, input));
      await invalidateForM2Command(queryClient, "report_safety_incident", {
        engagementId,
        ...(input.stageId === null ? {} : { stageId: input.stageId }),
      });
      await queryClient.invalidateQueries({ queryKey: safetyIncidentsKey(engagementId) });
    },
    // The list is refetched either way: a failed request may still have written
    // the row, and an incident that exists but is not shown is the one failure
    // this screen cannot have.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: safetyIncidentsKey(engagementId) });
    },
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   `M2-FE-507` — day one did not happen
   -------------------------------------------------------------------------- */

/**
 * The party this app may report, and the only one.
 *
 * The mirror of Session A's `CUSTOMER_REPORTS_CREW_PARTY`. `party` decides the
 * money: `CUSTOMER` forfeits the booking fee and splits it — a travel-compensation
 * share to the lead who travelled, the remainder to the platform — while `VENDOR`
 * refunds it in full and re-dispatches.
 *
 * A vendor declaring **their own** no-show through a self-serve button is a money
 * command issued against themselves, and it is not offered here. The API permits
 * either participant to send either party; the product does not, for the same
 * reason the Customer's app only sends `VENDOR`. A lead who genuinely cannot send
 * a crew is routed to support, which is where a decision with that shape belongs
 * until `request_cancellation` has a screen.
 */
export const PARTNER_REPORTS_CREW_PARTY = "CUSTOMER" as const;

/**
 * The reasons that belong to the `CUSTOMER` party.
 *
 * From the published `CrewNoShowReasonCodeEnum`, filtered to the two this app
 * may send. `vendor_no_show` is in the enum and is deliberately absent here —
 * see `PARTNER_REPORTS_CREW_PARTY`.
 */
export const PARTNER_CREW_NO_SHOW_REASONS = [
  "customer_no_show",
  "gate_locked",
] as const satisfies readonly Schemas["CrewNoShowReasonCodeEnum"][];
export type PartnerCrewNoShowReason = (typeof PARTNER_CREW_NO_SHOW_REASONS)[number];

/**
 * Report that day one did not happen because the Customer was not there —
 * `M2-FE-507`'s no-show and Customer-unavailable halves.
 *
 * Keyed by the **requirement**, not the engagement, because the money it moves is
 * the booking fee and the fee lives on the requirement: a forfeit can land on a
 * booking whose engagement never opened at all.
 *
 * `m2_policy_unavailable` is the refusal that matters and it is not an error in
 * this app: while the owner has not configured the forfeit split, the fee stays
 * `ACTIVE` and visible rather than being divided on an invented ratio. The screen
 * says that rather than offering a retry.
 *
 * There is no `report_crew_no_show` row in `M2Command`, so the invalidation is
 * hand-written — `engagements.all`, because a vendor no-show re-dispatches and a
 * customer no-show closes the booking, and either way this vendor's list moved.
 * Requested in `frontend-execution-plan.md` §7.
 */
export function useReportCrewNoShow(requirementId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { readonly reasonCode: PartnerCrewNoShowReason }) => {
      const operation = `m2-crew-no-show:${requirementId}:${PARTNER_REPORTS_CREW_PARTY}:${input.reasonCode}`;
      return request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/crew/no-show/", {
          params: {
            path: { requirement_id: requirementId },
            header: { "Idempotency-Key": getStableIdempotencyKey(operation) },
          },
          body: { party: PARTNER_REPORTS_CREW_PARTY, reason_code: input.reasonCode },
        }),
      );
    },
    onSuccess: async (_fee, input) => {
      clearIdempotencyKey(
        `m2-crew-no-show:${requirementId}:${PARTNER_REPORTS_CREW_PARTY}:${input.reasonCode}`,
      );
      await queryClient.invalidateQueries({ queryKey: m2QueryKeys.engagements.all });
    },
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   Refusals
   -------------------------------------------------------------------------- */

/*
 * There is deliberately no `isNotAShiftDay` here.
 *
 * The A5 guard on an A3-only route — `m2_stage_transition_not_allowed` raised by
 * the shift-day *read*, meaning the caller opened a project milestone, which has
 * no crew, no attendance and no daily settlement — was written in this file and
 * is now `@vsolve/query`'s, published from `m2-engagement-customer.ts` in
 * Session A's half of the same wave. Both columns read it off the same endpoint
 * and it is one rule, so it gets one home: the screen imports the shared one.
 *
 * The refusals that genuinely belong to this column — `isCrewConflict` and
 * `isCrewRosterRequired` — live in `m2-engagement-partner.ts` beside the rules
 * they guard, because the Customer never assigns crew and never sees either.
 */
