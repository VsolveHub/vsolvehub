"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiRequestError, getStableIdempotencyKey, request, type Schemas } from "@vsolve/api-client";
import {
  M2_FRESHNESS,
  boundedPoll,
  cursorFromNextUrl,
  isAmendmentListSettled,
  isEngagementSettled,
  m2QueryKeys,
  shouldRetryM2Read,
  type Engagement,
  type EngagementAmendmentList,
  type EngagementEventList,
  type EngagementStage,
  type StageDisputeReason,
} from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The Customer's engagement reads and every command on them — contract 1.25.0.
 *
 * Wave A2 mounted two of these: the engagement read and stage funding. Wave A3
 * adds what happens *after* an engagement opens — the list both archetypes are
 * read from, the stage spine, amendments, the shared event record and the final
 * acceptance.
 *
 * ## One spine, both archetypes, and no branch in this file
 *
 * A3 maps a stage to a shift-day and A5 to a milestone, and every command below
 * is the same command for both. The archetype changes only what a command
 * *refuses* and what money it moves — never the route, the shape or the state
 * machine (`07-state-machines-and-permissions.md` §5). A hook that took an
 * archetype would be the first step back towards two parallel subsystems.
 *
 * ## Why the engagement read polls, and only while money is in flight
 *
 * An engagement moves when somebody does some work — days, not seconds — so a
 * timer on it would be load for nothing. A **stage funding charge** is the
 * exception: like every other M2 charge it settles on a verified provider
 * callback, and the Customer is sitting on the screen waiting for it.
 * `isEngagementSettled` is false exactly while a stage reads `PENDING`. The
 * amendment list polls on the same rule and no other: an amendment with a charge
 * in flight has changed nothing yet.
 *
 * ## Why the stage read does not poll at all
 *
 * A stage sits in `AWAITING_REVIEW` for as long as the review window lasts —
 * hours or days — and a poll that runs for a day to observe one transition is a
 * timer nobody would defend. The window is rendered from the server clock, and
 * when it passes the screen stops offering the actions and refetches **once**,
 * on the Customer's own press. `EXPIRING_STATE` gives it a refetch on focus,
 * which is when a person actually comes back to look.
 */

export type { Engagement, EngagementStage };
export type ProjectCompletionCode = Schemas["ProjectCompletionCode"];

/* --------------------------------------------------------------------------
   Reads
   -------------------------------------------------------------------------- */

/**
 * The Customer's engagements — `M2-FE-509` (A3) and `M2-FE-608` (A5).
 *
 * **One endpoint for both lists.** `GET /engagements/` is a cursor page over the
 * caller's own engagements and `commercial_mode` is what separates a workforce
 * booking from a project. The two screens filter the same read rather than
 * calling two endpoints, because there is only one endpoint and inventing a
 * second query per archetype would put the split in the cache — exactly what
 * `m2-keys.ts` argues against in its own header.
 *
 * The bucket in the key is the caller's role rather than the archetype, for the
 * same reason: `customer` is what this app can ever read, and a Partner reading
 * the same route gets a different projection through their own app.
 *
 * `role` is documented on the operation and **not published as a parameter** at
 * 1.25.0, so nothing is sent — the server defaults to whichever the caller can
 * be, which for this app is always the Customer. Logged in §7.
 *
 * Cursor-paged through the M1 pattern in `features/bookings/queries.ts`, `next`
 * is never raw-fetched, and `cursorFromNextUrl` is validated **while the page is
 * being accepted** rather than only in `getNextPageParam` — a contract failure
 * there leaves a truncated list looking complete, which on this surface would be
 * a Customer concluding a project they have money in no longer exists.
 */
export function useEngagements() {
  return useInfiniteQuery({
    queryKey: m2QueryKeys.engagements.list("customer"),
    queryFn: async ({ pageParam }) => {
      const page = await request(() =>
        getApiClient().GET("/api/v1/engagements/", {
          params: { query: { ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      );
      cursorFromNextUrl(page.next);
      return page;
    },
    initialPageParam: "" as string,
    getNextPageParam: (lastPage) => cursorFromNextUrl(lastPage.next),
    ...M2_FRESHNESS.engagementList,
    retry: shouldRetryM2Read,
  });
}

/**
 * One engagement, both archetypes.
 *
 * A `404` is not retried: object-level authorization answers `404` rather than
 * `403` wherever existence is private, so it means "gone, or never yours" and
 * neither becomes true on a second attempt.
 */
export function useEngagement(engagementId: string | null) {
  return useQuery({
    queryKey: m2QueryKeys.engagements.detail(engagementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/engagements/{engagement_id}/", {
          params: { path: { engagement_id: engagementId! } },
        }),
      ),
    enabled: engagementId !== null,
    ...M2_FRESHNESS.engagementDetail,
    ...boundedPoll<Engagement>({ isSettled: isEngagementSettled }),
    retry: shouldRetryM2Read,
  });
}

/**
 * One stage — `M2-FE-609`.
 *
 * Read on its own route rather than picked out of the engagement's `stages[]`,
 * because the stage review is reached from a notification with a stage id in
 * hand and because `EXPIRING_STATE` is the tier the review clock needs. The
 * engagement is read beside it for `commercial_mode`: what approval does to
 * money is a property of the agreement, not of the stage.
 */
export function useStage(engagementId: string, stageId: string | null) {
  return useQuery({
    queryKey: m2QueryKeys.engagements.stage(engagementId, stageId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/engagement-stages/{stage_id}/", {
          params: { path: { stage_id: stageId! } },
        }),
      ),
    enabled: stageId !== null,
    // Review timeouts auto-approve. That is the whole reason this read is on the
    // expiring tier rather than the volatile one.
    ...M2_FRESHNESS.stage,
    retry: shouldRetryM2Read,
  });
}

/**
 * The agreement's own history — `M2-FE-512`.
 *
 * Partial service, replacement, refund, dispute and closure all arrive here, in
 * one chronological record, and **nothing on it is synthesised by this client**.
 * `actor_is_system` is the field that keeps it honest: "approved by a person"
 * and "approved because the review window closed" are different sentences, and
 * a timeline that renders them identically is lying about who decided.
 *
 * Keyed on `m2QueryKeys.engagements.events(id)`, which the frozen factory landed
 * on this column's §7 request. Wave A3 composed it locally as
 * `detail(id) + "events"` — correct by construction and unreviewable, because a
 * key nobody can find in the factory is a key nobody can check the invalidation
 * of. The shape is unchanged: still nested under the detail, so every existing
 * engagement invalidation still clears it by prefix.
 */
export function useEngagementEvents(engagementId: string | null) {
  return useQuery({
    queryKey: m2QueryKeys.engagements.events(engagementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/engagements/{engagement_id}/events/", {
          params: { path: { engagement_id: engagementId! } },
        }),
      ),
    enabled: engagementId !== null,
    // The factory wrote this read its own tier: transitions land whenever the
    // other party or a sweep acts, which is the volatile question, not an
    // expiring one — nothing on this list has a deadline the Customer acts on.
    ...M2_FRESHNESS.engagementEvents,
    retry: shouldRetryM2Read,
  });
}

/**
 * Change requests on this engagement — `M2-FE-610`, `M2-FE-511`, `M2-FE-613`.
 *
 * One read serves three tasks because they are three views of one list: the live
 * request to decide, the applied ones that make up the agreement's version
 * history, and the declined or expired ones that explain why the agreement did
 * not change.
 *
 * Keyed on `m2QueryKeys.engagements.amendments(id)` and on
 * `M2_FRESHNESS.amendments`, both landed by the frozen factory on this column's
 * §7 request. Wave A3 borrowed `engagements.agreement(id)` because the key's own
 * doc said "the immutable agreement **and its amendment history**" — and then
 * had to refuse that key's `SESSION_STATE` tier, which is the tell that one key
 * was carrying two reads. They have opposite freshness: the agreement is written
 * once and never changes, and a *proposed* amendment is a live change request
 * with a deadline and a money delta on it, decided from two devices. Serving one
 * from a session-long cache is how a Customer approves a delta that expired an
 * hour ago.
 *
 * `agreement` keeps `SESSION_STATE` for the immutable terms and nothing in this
 * app reads amendments off it any more. Still nested under `engagements.detail`,
 * so the existing invalidation rows clear it by prefix.
 */
export function useEngagementAmendments(engagementId: string | null) {
  return useQuery({
    queryKey: m2QueryKeys.engagements.amendments(engagementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/engagements/{engagement_id}/amendments/", {
          params: { path: { engagement_id: engagementId! } },
        }),
      ),
    enabled: engagementId !== null,
    ...M2_FRESHNESS.amendments,
    ...boundedPoll<EngagementAmendmentList>({ isSettled: isAmendmentListSettled }),
    retry: shouldRetryM2Read,
  });
}

export type { EngagementAmendmentList, EngagementEventList };

/* --------------------------------------------------------------------------
   Stage funding — `M2-FE-416`, `M2-FE-417`
   -------------------------------------------------------------------------- */

export interface FundStageInput {
  engagementId: string;
  stageId: string;
}

/**
 * Funds one A5 stage.
 *
 * **At face value.** There is no stage credit: the visit-plan money was spent on
 * the visits themselves and settles per share, so discounting a stage by it
 * would pay for those visits twice out of the vendor's work. No screen in this
 * app may imply otherwise, and nothing here subtracts anything.
 *
 * Keyed on the stage, which is the aggregate being charged for. One stage is
 * funded once, so a double press, a dropped connection and a reopened tab all
 * land on the same attempt.
 */
export function useFundStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: FundStageInput) =>
      request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/funding/", {
          params: {
            path: { stage_id: input.stageId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(`m2-stage-funding:${input.stageId}`),
            },
          },
        }),
      ),
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.engagements.detail(input.engagementId),
      });
    },
    retry: false,
  });
}

export interface SimulateStageCaptureInput {
  /** Only so the engagement's own totals can be refetched. */
  engagementId: string;
  paymentAttemptId: string;
}

/**
 * Marks a stage's funding charge captured with no gateway involved.
 *
 * **Development only, and the server is the gatekeeper.** `POST
 * /payment-attempts/{id}/simulate-capture/` answers `404` wherever simulated
 * capture is switched off, and refuses any attempt that is not on the fake
 * provider — so this cannot be made to work in production by calling it.
 *
 * ## Why the customer app has this at all
 *
 * `POST /engagement-stages/{id}/funding/` creates a checkout and hands back a
 * `payment_attempt_id`. Nothing then completed it: no provider is configured,
 * so every funded stage sat at `PROVIDER_PENDING` for ever and the whole of what
 * funding triggers — the stage moving to `FUNDED`, the engagement's running
 * totals, the vendor being told they can start — was unreachable. The button
 * existed and the outcome did not.
 *
 * ## Why it routes through the same endpoint as every other simulated capture
 *
 * Because `simulate_capture` hands a fabricated "captured" to
 * `apply_provider_payment`, which is the function a real webhook calls. A stub
 * that flipped the stage's own status would produce a stage nothing downstream
 * agreed was funded, which is worse than no stub — it makes development diverge
 * from production exactly where the money is.
 */
export function useSimulateStageCapture() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SimulateStageCaptureInput) =>
      request(() =>
        getApiClient().POST("/api/v1/payment-attempts/{attempt_id}/simulate-capture/", {
          params: { path: { attempt_id: input.paymentAttemptId } },
        }),
      ),
    onSettled: (_data, _error, input) => {
      // The stage's funding state, the engagement's four running totals and the
      // list row's next action all move on capture. `detail` is a prefix of the
      // stage key, so one call covers the stage the Customer is looking at too.
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.engagements.detail(input.engagementId),
      });
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.engagements.list("customer"),
      });
    },
    retry: false,
  });
}

/**
 * `404` from simulated capture — the environment has it switched off.
 *
 * Not an error to show. It is how production answers, and the panel simply is
 * not offered there.
 */
export function isSimulatedCaptureUnavailable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

/* --------------------------------------------------------------------------
   The stage review — `M2-FE-609`
   -------------------------------------------------------------------------- */

export interface StageCommandInput {
  /** Only so the engagement's own totals can be refetched. */
  engagementId: string;
  stageId: string;
}

/**
 * Invalidates everything one stage command can have made untrue.
 *
 * `M2_INVALIDATION` maps `approve_stage`, `request_correction` and
 * `dispute_stage` to `engagements.detail(id)`, which is a **prefix** of the
 * stage key — so one call clears both the engagement's running totals and the
 * stage the Customer is looking at. The list moves too: a stage leaving review
 * changes the row's next action, which is the only thing that row is for.
 */
function invalidateAfterStageCommand(
  queryClient: ReturnType<typeof useQueryClient>,
  engagementId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: m2QueryKeys.engagements.detail(engagementId),
  });
  void queryClient.invalidateQueries({
    queryKey: m2QueryKeys.engagements.list("customer"),
  });
}

/**
 * Approves a stage — **this is the button that releases money.**
 *
 * On a managed (A5) engagement it writes the vendor's earning *held* on the M1
 * payout rails and stamps the dispute window; the money becomes payable when
 * that window closes. On `LEAD_ONLY` (A3) nothing is held because nothing was
 * collected, so the stage goes straight to `RELEASED` and the Customer still
 * owes the vendor directly.
 *
 * No auto-retry. `409 m2_stage_disputed` means somebody disputed in the same
 * moment and `409 m2_stage_transition_not_allowed` means nothing was submitted;
 * both are answered by re-reading, which `onSettled` does, and neither by
 * sending the same command again.
 */
export function useApproveStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StageCommandInput) =>
      request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/approve/", {
          params: {
            path: { stage_id: input.stageId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(`m2-stage-approve:${input.stageId}`),
            },
          },
        }),
      ),
    onSettled: (_data, _error, input) => invalidateAfterStageCommand(queryClient, input.engagementId),
    retry: false,
  });
}

export interface RequestCorrectionInput extends StageCommandInput {
  note: string;
}

/**
 * Sends a stage back to be done properly — and moves no money.
 *
 * **A correction is not an amendment.** It asks for the *agreed* work to be
 * done, not for different work; the vendor resubmits and the review window
 * restarts from zero, because the Customer will be looking at different
 * evidence. A Customer who wants something else is asking for a change order,
 * and the server says so with `m2_amendment_required`.
 *
 * The note is required by the endpoint and is the whole content of the request.
 */
export function useRequestCorrection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RequestCorrectionInput) =>
      request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/correction/", {
          params: {
            path: { stage_id: input.stageId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(`m2-stage-correction:${input.stageId}`),
            },
          },
          body: { note: input.note },
        }),
      ),
    onSettled: (_data, _error, input) => invalidateAfterStageCommand(queryClient, input.engagementId),
    retry: false,
  });
}

export interface DisputeStageInput extends StageCommandInput {
  reasonCode: StageDisputeReason;
  note: string;
}

/**
 * Disputes a stage — **and this is what stops the clock.**
 *
 * `AWAITING_REVIEW → APPROVED` on review timeout is refused while the stage is
 * `DISPUTED`, and the server additionally clears `review_due_at` so the sweep
 * cannot see the row at all. So disputing is not merely an objection: it is the
 * only action that prevents a silent auto-approval, and the screen offering it
 * has to say so before it is pressed.
 *
 * It stops **only the disputed allocation**. Every other stage carries on, any
 * payout already released stays released, and the engagement returns to `ACTIVE`
 * when the last disputed stage is resolved. Nothing here freezes the job.
 */
export function useDisputeStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DisputeStageInput) =>
      request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/dispute/", {
          params: {
            path: { stage_id: input.stageId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(`m2-stage-dispute:${input.stageId}`),
            },
          },
          body: { reason_code: input.reasonCode, note: input.note },
        }),
      ),
    onSettled: (_data, _error, input) => invalidateAfterStageCommand(queryClient, input.engagementId),
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   Amendments — `M2-FE-610`, `M2-FE-511`
   -------------------------------------------------------------------------- */

export interface AmendmentDecisionInput {
  /** Only so the agreement and the engagement can be refetched. */
  engagementId: string;
  amendmentId: string;
}

function invalidateAfterAmendmentDecision(
  queryClient: ReturnType<typeof useQueryClient>,
  engagementId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: m2QueryKeys.engagements.detail(engagementId),
  });
  void queryClient.invalidateQueries({
    queryKey: m2QueryKeys.engagements.list("customer"),
  });
}

/**
 * Accepts a change request — `M2-FE-610`.
 *
 * **Money before scope.** Accepting does not change the agreed work until the
 * money has moved, and the response says which of the three routes this is:
 *
 * - `checkout: null` on `LEAD_ONLY` — no platform money exists to move, so the
 *   extension authorises on acceptance and the extra shift-days appear at once.
 * - `checkout: null` on a managed reduction — the refund is issued against the
 *   stage's own funding payment **before** the scope shrinks, so there is no
 *   instant in which the Customer owns less work than they have paid for.
 * - a `PaymentAttempt` on a managed increase — and **nothing changes until a
 *   verified provider callback lands.** The screen renders that as waiting, not
 *   as agreed, and offers nothing to press: repeating the acceptance returns the
 *   same attempt, and a second control over it is a second way to try to pay.
 *
 * The key is the amendment, which is the thing being decided. One amendment is
 * accepted once.
 */
export function useAcceptAmendment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AmendmentDecisionInput) =>
      request(() =>
        getApiClient().POST(
          "/api/v1/engagement-amendments/{engagement_amendment_id}/accept/",
          {
            params: {
              path: { engagement_amendment_id: input.amendmentId },
              header: {
                "Idempotency-Key": getStableIdempotencyKey(
                  `m2-amendment-accept:${input.amendmentId}`,
                ),
              },
            },
          },
        ),
      ),
    onSettled: (_data, _error, input) =>
      invalidateAfterAmendmentDecision(queryClient, input.engagementId),
    retry: false,
  });
}

/**
 * Declines a change request.
 *
 * Nothing is charged and the agreement stays exactly as it was. Its own command
 * rather than a flag on the acceptance, because the two have different
 * idempotency scopes — a Customer who declines and then accepts is not retrying,
 * they are changing their mind, and one shared key would replay the first answer.
 */
export function useDeclineAmendment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AmendmentDecisionInput) =>
      request(() =>
        getApiClient().POST(
          "/api/v1/engagement-amendments/{engagement_amendment_id}/decline/",
          {
            params: {
              path: { engagement_amendment_id: input.amendmentId },
              header: {
                "Idempotency-Key": getStableIdempotencyKey(
                  `m2-amendment-decline:${input.amendmentId}`,
                ),
              },
            },
          },
        ),
      ),
    onSettled: (_data, _error, input) =>
      invalidateAfterAmendmentDecision(queryClient, input.engagementId),
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   Completion — `M2-FE-511`
   -------------------------------------------------------------------------- */

/**
 * The Customer agrees the job is done — `COMPLETING → COMPLETED`.
 *
 * An engagement reaches `COMPLETING` on its own when every stage is released.
 * This is the separate fact that the Customer agrees it is finished, and it
 * closes the requirement as `CLOSED_COMPLETE` — the last transition in
 * `07-state-machines-and-permissions.md` §1, which until 1.25.0 had nothing to
 * drive it.
 *
 * `409 m2_stage_transition_not_allowed` when stages are still open, which is a
 * re-read rather than a retry.
 */
export function useAcceptCompletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (engagementId: string) =>
      request(() =>
        getApiClient().POST("/api/v1/engagements/{engagement_id}/completion/", {
          params: {
            path: { engagement_id: engagementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(`m2-engagement-completion:${engagementId}`),
            },
          },
        }),
      ),
    onSettled: (_data, _error, engagementId) => {
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.engagements.detail(engagementId),
      });
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.engagements.list("customer"),
      });
      // Completion closes the requirement as `CLOSED_COMPLETE`, so `My requests`
      // and the request detail are both out of date the moment this succeeds.
      void queryClient.invalidateQueries({ queryKey: m2QueryKeys.requirements.all });
    },
    retry: false,
  });
}

/** Customer-only read of the live code. A Partner has no equivalent read endpoint. */
export function useProjectCompletionCode(engagementId: string, enabled: boolean) {
  return useQuery({
    queryKey: m2QueryKeys.engagements.completionCode(engagementId),
    queryFn: (): Promise<ProjectCompletionCode> =>
      request(() =>
        getApiClient().GET("/api/v1/engagements/{engagement_id}/completion-code/", {
          params: { path: { engagement_id: engagementId } },
        }),
      ),
    enabled,
    ...M2_FRESHNESS.stage,
    retry: shouldRetryM2Read,
  });
}

/** Issue a short-lived Customer-held code that explicitly accepts the whole project. */
export function useIssueProjectCompletionCode(engagementId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (): Promise<ProjectCompletionCode> =>
      request(() =>
        getApiClient().POST("/api/v1/engagements/{engagement_id}/completion-code/", {
          params: { path: { engagement_id: engagementId } },
        }),
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(m2QueryKeys.engagements.completionCode(engagementId), result);
    },
    retry: false,
  });
}
