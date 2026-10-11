"use client";

import { getStableIdempotencyKey, request, type Schemas } from "@vsolve/api-client";
import {
  M2_OPS_FRESHNESS,
  m2OpsKeys,
  type ReclassificationTarget,
  type RefundReviewDecision,
  type RequestTimeline,
} from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The M2 Operations workspace: queues, one request's history, and the four
 * recovery commands (contract 1.32.0).
 *
 * ## Commands write the cache; they do not invalidate it
 *
 * `rematch`, `deadline` and `reclassification` each return the **refreshed
 * timeline**, so the response is written straight into the same cache entry the
 * screen is rendering. That is not a saved round trip: `rematch` advances a
 * cascade or starts an invitation wave, and a screen that refetched afterwards
 * could race the write and show the state from *before* the wave it just
 * started — at the one moment an operator is deciding whether to press it again.
 *
 * `refund-review` is the exception and returns an `OperationsTouch`, because it
 * records a decision and moves no money. That one invalidates.
 *
 * ## The idempotency key carries the payload, not just the target
 *
 * Every command here takes a free-text reason, and `execute_idempotent` compares
 * only the small `request_payload` Django chose to store — for the assisted
 * proposal, just `{invitation_id}`. So a key scoped to the target alone would
 * make a *corrected* quote replay the wrong one. The key includes the body the
 * operator actually composed: same body means replay, different body means a
 * different command.
 *
 * ## No read lists requests
 *
 * The contract publishes queue **depths** and per-request reads, and nothing
 * that enumerates the requests inside a queue. So the console takes a
 * requirement id, exactly as the manual-offer and assisted-checkout surfaces
 * take theirs, and says so on screen rather than inventing a search backed by
 * nothing. Logged in `frontend-execution-plan.md` §7.
 */

export type OperationsTouchRow = Schemas["OperationsTouch"];

function commandKey(action: string, requirementId: string, body: unknown): string {
  return getStableIdempotencyKey(`m2-ops-${action}:${requirementId}:${JSON.stringify(body)}`);
}

/* ---------------------------------------------------------------------------
   Reads
   --------------------------------------------------------------------------- */

/** `M2-FE-701`. The eight stuck-state queues, as C6 computed them. */
export function useStuckQueues() {
  return useQuery({
    queryKey: m2OpsKeys.queues(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/operations/queues/", {})),
    ...M2_OPS_FRESHNESS.queues,
    // The one polled read in this feature. A queue board left open is how an
    // operator notices a queue filling, and every member of every queue is
    // already past a deadline.
    refetchInterval: 30_000,
  });
}

/** `M2-FE-702`. One request end to end. */
export function useRequestTimeline(requirementId: string | null) {
  return useQuery({
    queryKey: m2OpsKeys.timeline(requirementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/requests/{requirement_id}/timeline/", {
          params: { path: { requirement_id: requirementId! } },
        }),
      ),
    enabled: requirementId !== null,
    ...M2_OPS_FRESHNESS.timeline,
    retry: false,
  });
}

/** The Operations cost of one request, and whether it fits the approved model. */
export function useTouchMetric(requirementId: string | null) {
  return useQuery({
    queryKey: m2OpsKeys.touchMetric(requirementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/requests/{requirement_id}/touch-metric/", {
          params: { path: { requirement_id: requirementId! } },
        }),
      ),
    enabled: requirementId !== null,
    ...M2_OPS_FRESHNESS.touchMetric,
    retry: false,
  });
}

/*
 * The thirty-day touch rollup (`GET /operations/metrics/touches/`, `M2-FE-711`)
 * is deliberately not read here. It is a platform-wide measure rather than
 * anything about one request, and Session A's `/operations/cases/touches` route
 * owns it; two hooks against one endpoint would be the duplicate money component
 * the Gate 4 criterion names. The **per-request** metric above stays, because
 * "one request end to end … and money" is this task and the touch list is where
 * `M2-FE-703`'s actor, reason and timestamp actually live.
 */

/* ---------------------------------------------------------------------------
   `M2-FE-704` — recovery commands
   --------------------------------------------------------------------------- */

function useTimelineCache(requirementId: string) {
  const queryClient = useQueryClient();
  return {
    /** The command answered with the whole timeline. Write it; do not race a refetch. */
    apply(timeline: RequestTimeline) {
      queryClient.setQueryData(m2OpsKeys.timeline(requirementId), timeline);
      // A recovery touch changes the cost of this request and can empty a queue.
      void queryClient.invalidateQueries({ queryKey: m2OpsKeys.touchMetric(requirementId) });
      void queryClient.invalidateQueries({ queryKey: m2OpsKeys.queues() });
    },
    /** The command answered with something narrower, or failed. Re-read. */
    refetch() {
      void queryClient.invalidateQueries({ queryKey: m2OpsKeys.timeline(requirementId) });
      void queryClient.invalidateQueries({ queryKey: m2OpsKeys.touchMetric(requirementId) });
      void queryClient.invalidateQueries({ queryKey: m2OpsKeys.queues() });
    },
  };
}

/**
 * Rematch: one button, two engines.
 *
 * A rate-card A3 booking advances its **cascade**; everything else runs another
 * **invitation wave**. Django decides which, and this hook does not ask — a
 * client that branched on archetype would be a second copy of a routing rule
 * that already exists, and the Customer does not have to know which engine
 * answered their question. Neither charges anything.
 */
export function useRematchRequest(requirementId: string) {
  const cache = useTimelineCache(requirementId);
  return useMutation({
    mutationFn: (input: { reason: string }) => {
      const body = { reason: input.reason.trim() };
      return request(() =>
        getApiClient().POST("/api/v1/operations/requests/{requirement_id}/rematch/", {
          params: {
            path: { requirement_id: requirementId },
            header: { "Idempotency-Key": commandKey("rematch", requirementId, body) },
          },
          body,
        }),
      );
    },
    onSuccess: cache.apply,
    onError: cache.refetch,
    retry: false,
  });
}

/**
 * Extend the needed-by date. **Forward only.**
 *
 * A negative extension is refused by the server rather than clamped, and the
 * form does not offer one: pulling a date in would be a way to close somebody's
 * live request by moving its clock, which is the opposite of a recovery action.
 */
export function useExtendDeadline(requirementId: string) {
  const cache = useTimelineCache(requirementId);
  return useMutation({
    mutationFn: (input: { extraHours: number; reason: string }) => {
      const body = { extra_hours: input.extraHours, reason: input.reason.trim() };
      return request(() =>
        getApiClient().POST("/api/v1/operations/requests/{requirement_id}/deadline/", {
          params: {
            path: { requirement_id: requirementId },
            header: { "Idempotency-Key": commandKey("deadline", requirementId, body) },
          },
          body,
        }),
      );
    },
    onSuccess: cache.apply,
    onError: cache.refetch,
    retry: false,
  });
}

/**
 * Reclassify between the workforce and project lifecycles.
 *
 * Every paid value is preserved — unfilled visit shares refund or convert, a
 * charged unlock survives — and matching restarts with **no second charge**.
 * The screen states that rather than warning about money it cannot see moving.
 */
export function useReclassifyRequest(requirementId: string) {
  const cache = useTimelineCache(requirementId);
  return useMutation({
    mutationFn: (input: { toArchetype: ReclassificationTarget; reason: string }) => {
      const body = { to_archetype: input.toArchetype, reason: input.reason.trim() };
      return request(() =>
        getApiClient().POST("/api/v1/operations/requests/{requirement_id}/reclassification/", {
          params: {
            path: { requirement_id: requirementId },
            header: { "Idempotency-Key": commandKey("reclassify", requirementId, body) },
          },
          body,
        }),
      );
    },
    onSuccess: cache.apply,
    onError: cache.refetch,
    retry: false,
  });
}

/**
 * Record that a refund was reviewed, and what was decided.
 *
 * **It records; it moves no money**, and the screen says so in those words.
 * Each product refunds through the module that owns it — the booking fee, the
 * unlock, the visit share — and an Operations control that offered an amount
 * field would be offering a second refund path with none of the first's
 * reconciliation. Answers an `OperationsTouch`, not a timeline, so this is the
 * one command here that invalidates instead of writing.
 */
export function useRefundReview(requirementId: string) {
  const cache = useTimelineCache(requirementId);
  return useMutation({
    mutationFn: (input: { decision: RefundReviewDecision; reason: string }) => {
      const body = { decision: input.decision, reason: input.reason.trim() };
      return request(() =>
        getApiClient().POST("/api/v1/operations/requests/{requirement_id}/refund-review/", {
          params: {
            path: { requirement_id: requirementId },
            header: { "Idempotency-Key": commandKey("refund-review", requirementId, body) },
          },
          body,
        }),
      );
    },
    onSuccess: cache.refetch,
    onError: cache.refetch,
    retry: false,
  });
}

/* ---------------------------------------------------------------------------
   `M2-FE-705` — assisted capture
   --------------------------------------------------------------------------- */

/**
 * Write down a clarification that happened on the phone.
 *
 * Attribution goes to the **parties**: the question is the Partner's and the
 * answer is the Customer's, with the operator recorded beside them. The response
 * carries `asked_by_role: OPERATIONS`, which is what stops an assisted question
 * rendering as an ordinary vendor question anywhere downstream.
 *
 * Consent is a refusal, not a flag — without it the capture does not happen, so
 * the form gates the button on it and the field is sent as the operator set it.
 */
export function useAssistedClarification(requirementId: string) {
  const cache = useTimelineCache(requirementId);
  return useMutation({
    mutationFn: (input: {
      invitationId: string;
      question: string;
      answer: string;
      consentRecorded: boolean;
    }) => {
      const body = {
        question: input.question.trim(),
        answer: input.answer.trim(),
        consent_recorded: input.consentRecorded,
      };
      return request(() =>
        getApiClient().POST(
          "/api/v1/operations/enquiries/{invitation_id}/assisted-clarification/",
          {
            params: {
              path: { invitation_id: input.invitationId },
              header: {
                "Idempotency-Key": commandKey(
                  `clarification:${input.invitationId}`,
                  requirementId,
                  body,
                ),
              },
            },
            body,
          },
        ),
      );
    },
    onSuccess: cache.refetch,
    onError: cache.refetch,
    retry: false,
  });
}

/**
 * The composed body, in the shape the assisted route accepts.
 *
 * `AssistedProposalRequest` since 1.33.0 — `ProposalCreateRequest` plus
 * `consent_recorded`. A subclass rather than a field on the vendor's own shape,
 * because a vendor submitting their own quote is not consenting on anybody's
 * behalf.
 */
export type AssistedProposalBody = Schemas["AssistedProposalRequest"];

/**
 * Capture a quote a Partner gave over the phone, attributed to that Partner.
 *
 * A **primary path** under revision 4 for the quote-flow fallback: on the A3
 * fallback the vendors who answer fastest are often the ones who will not fill
 * in a form. It is still not a way for staff to publish a price — the proposal
 * is written with `vendor_confirmed_at: null`, every Customer-facing read
 * filters on that, and the vendor's own confirmation is what makes it visible.
 * There is no way to skip that state, and the screen renders it explicitly.
 *
 * The wage floor is derived and enforced here identically to a vendor's own
 * submission, so a captured A3 rate below the statutory floor is refused with
 * `m2_proposal_below_wage_floor` — the same refusal the vendor would have got.
 *
 * ## `consent_recorded` carries what the operator ticked, and nothing else
 *
 * Contract 1.33.0 closed a real defect: the view passed `consent_recorded=True`
 * unconditionally, so `capture_assisted_proposal`'s refusal could not fire and
 * every assisted quote wrote an audit row asserting a consent nobody had
 * recorded — a false statement in the record of a real vendor's price.
 *
 * The fix is only a fix if the value on the wire is the value a person set. This
 * hook therefore takes the flag from the caller and **never defaults it**: an
 * unticked box sends `false` and earns a `409`, which is the correct outcome and
 * the whole point. Passing a literal `true` from here to satisfy the type would
 * recreate the defect one layer up and make it worse, because the server would
 * then be faithfully recording a consent the *client* invented.
 */
export function useAssistedProposal(requirementId: string) {
  const cache = useTimelineCache(requirementId);
  return useMutation({
    mutationFn: (body: AssistedProposalBody) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/assisted-proposals/", {
          params: {
            header: {
              "Idempotency-Key": commandKey("assisted-proposal", requirementId, body),
            },
          },
          body,
        }),
      ),
    onSuccess: cache.refetch,
    onError: cache.refetch,
    retry: false,
  });
}

/* ---------------------------------------------------------------------------
   A5 project recovery: move unfinished milestones to another vendor, or end the project.
   --------------------------------------------------------------------------- */

const projectKey = (engagementId: string) => ["ops", "project", engagementId] as const;

export function useOperationsProject(engagementId: string | null) {
  return useQuery({
    queryKey: projectKey(engagementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/engagements/{engagement_id}/project/", {
          params: { path: { engagement_id: engagementId as string } },
        }),
      ),
    enabled: engagementId !== null,
    retry: false,
  });
}

export function useProposeProjectTransfer(engagementId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["ProjectTransferProposeRequest"]) =>
      request(() =>
        getApiClient().POST("/api/v1/engagements/{engagement_id}/transfer/", {
          params: {
            path: { engagement_id: engagementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `project-transfer:${engagementId}:${body.to_partner_id}:${JSON.stringify(body.quotes)}`,
              ),
            },
          },
          body,
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: projectKey(engagementId) }),
    retry: false,
  });
}

export function useTerminateProject(engagementId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["ProjectTerminationRequest"]) =>
      request(() =>
        getApiClient().POST("/api/v1/engagements/{engagement_id}/termination/", {
          params: {
            path: { engagement_id: engagementId },
            header: { "Idempotency-Key": getStableIdempotencyKey(`project-terminate:${engagementId}`) },
          },
          body,
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries(),
    retry: false,
  });
}
