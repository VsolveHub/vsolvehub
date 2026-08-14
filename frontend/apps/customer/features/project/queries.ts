"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getStableIdempotencyKey, request } from "@vsolve/api-client";
import {
  EXPIRING_STATE,
  m2QueryKeys,
  shouldRetryM2Read,
  type ProjectPlan,
  type ProjectTransfer,
} from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The Customer's A5 project — `M2-FE-611`, `612`, contract 1.31.0.
 *
 * One read and two commands: accept what was handed over, and answer a vendor
 * transfer Operations has proposed. The durable, React-free half is the project
 * section at the foot of `packages/query/src/m2-engagement-customer.ts`; this
 * file is its call site, the same split every other M2 feature in this app uses.
 *
 * ## One read, because it is one project
 *
 * `GET /engagements/{id}/project/` returns the milestones, the money, the
 * warranty retention, the handover and whatever recovery is in flight together.
 * The server's own reasoning is the reason there is one query key here rather
 * than four: a transfer proposal rendered beside a milestone list it was not
 * priced against is a screen the server will refuse to act on, and it is exactly
 * what four caches that can disagree would produce.
 *
 * ## Two commands the Customer has, and one they do not
 *
 * `m2_project_handover_accept` and `m2_project_transfer_decide` are the
 * Customer's. `m2_project_transfer_propose` is **Operations'** — nothing here
 * initiates a transfer, because 07 §7 does not let either party change the other's
 * agreement and the Customer's half of this is the acceptance. `m2_project_terminate`
 * is likewise not the Customer's command at 1.31.0.
 *
 * ## Three §7 rows this file is built against
 *
 * The frozen key factory has **no `projects` namespace**, `M2_FRESHNESS` has no
 * project tier, and `M2Command` has no row for either command. Built against the
 * current shape rather than by editing a frozen file, on the `rateCard` and
 * `shiftDays` precedents:
 *
 * - the key composes **from** the factory as `engagements.detail(id)` + `"project"`,
 *   so every existing engagement-level invalidation already clears it by prefix.
 *   The nesting is load-bearing rather than tidy: a transfer acceptance moves the
 *   engagement itself, and a project cache the engagement's own invalidations
 *   could not reach would survive it;
 * - freshness is `EXPIRING_STATE` taken **directly** rather than borrowed from a
 *   neighbouring row's name, because a live transfer proposal carries a server
 *   deadline the Customer acts on — the same argument that put `amendments` on
 *   that tier;
 * - both commands invalidate by hand, at exactly the prefixes `stageScope`
 *   returns when an engagement id is present, so the hand-written call and the
 *   table cannot drift while the rows are outstanding.
 *
 * ## Why nothing here polls
 *
 * **No money is in flight on either command.** A transfer settles structurally
 * inside one server transaction — refund, reprice, move the vendor — and there
 * is no checkout and no provider callback to wait for. Accepting a handover
 * moves no money at all. Contrast `features/crew/queries.ts`, which polls
 * because a booking fee settles on a verified callback while the Customer sits
 * on the screen. `EXPIRING_STATE` gives the refetch that actually matters here:
 * the one when the Customer comes back to look.
 */

export type { ProjectPlan, ProjectTransfer };

/* --------------------------------------------------------------------------
   The read
   -------------------------------------------------------------------------- */

/**
 * One A5 project, whole — `M2-FE-611`, `612`.
 *
 * `enabled` exists because the endpoint is A5-only: a workforce booking has
 * shift-days, not milestones, and the server says so with
 * `409 m2_stage_transition_not_allowed`. Mounting this on an A3 engagement would
 * put a refusal behind every workforce screen, and an ignored refusal is where a
 * real one hides. The caller passes the engagement's own `commercial_mode`
 * verdict rather than anything derived here — the exact shape `useShiftDay`
 * takes on the other archetype.
 *
 * A `404` is not retried: object-level authorization answers `404` wherever
 * existence is private, so it means "gone, or never yours" and neither becomes
 * true on a second attempt.
 */
export function useProject(engagementId: string, enabled = true) {
  return useQuery({
    queryKey: [...m2QueryKeys.engagements.detail(engagementId), "project"] as const,
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/engagements/{engagement_id}/project/", {
          params: { path: { engagement_id: engagementId } },
        }),
      ),
    enabled,
    ...EXPIRING_STATE,
    retry: shouldRetryM2Read,
  });
}

/**
 * What a project command can have made untrue.
 *
 * The prefixes `M2_INVALIDATION`'s `stageScope` returns when an engagement id is
 * present — `detail(id)` reaches the project key nested under it and every stage
 * read beneath it, and `all` reaches the sibling list buckets, which move when a
 * project's next action does. Written by hand only because neither command has a
 * row in the frozen table yet (§7); the prefixes are identical, so the two
 * cannot drift while that is outstanding.
 */
function invalidateProject(
  queryClient: ReturnType<typeof useQueryClient>,
  engagementId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: m2QueryKeys.engagements.detail(engagementId),
  });
  void queryClient.invalidateQueries({ queryKey: m2QueryKeys.engagements.all });
}

/* --------------------------------------------------------------------------
   Accepting the handover — `M2-FE-611`
   -------------------------------------------------------------------------- */

/**
 * The Customer accepts what was handed over — `M2-BE-547`.
 *
 * **Its own act, and sometimes also the end of the project.** Acceptance is
 * separate from closing the engagement because the two can legitimately happen
 * at different moments — a photographer delivers the gallery in week two of a
 * four-week edit. But when the project is already `COMPLETING`, accepting
 * finishes it: the response is the completed engagement and no second call is
 * needed. **Read `status` from the response**, because that finish can land on
 * `WARRANTY` rather than `COMPLETED` when a retention was withheld.
 *
 * **It can be refused for something that is not about the handover.** The server
 * runs the acceptance and the completion in one transaction, so an open or
 * disputed milestone rolls the acceptance back with it. That is why the screen
 * states what is still outstanding rather than reporting "we could not save your
 * acceptance".
 *
 * Keyed on the engagement: one handover is accepted once, so a double press, a
 * dropped connection and a reopened tab all land on the same acceptance.
 *
 * `requirements.all` is invalidated as well, on `useAcceptCompletion`'s
 * precedent — a completion closes the requirement as `CLOSED_COMPLETE`, and this
 * command can be the one that completes it.
 */
export function useAcceptHandover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (engagementId: string) =>
      request(() =>
        getApiClient().POST("/api/v1/engagements/{engagement_id}/handover/acceptance/", {
          params: {
            path: { engagement_id: engagementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(`m2-handover-accept:${engagementId}`),
            },
          },
        }),
      ),
    onSettled: (_data, _error, engagementId) => {
      invalidateProject(queryClient, engagementId);
      void queryClient.invalidateQueries({ queryKey: m2QueryKeys.requirements.all });
    },
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   Answering a proposed vendor transfer — `M2-FE-612`
   -------------------------------------------------------------------------- */

export interface TransferDecisionInput {
  /** Only so the engagement and its project read can be refetched. */
  engagementId: string;
  transferId: string;
  accept: boolean;
}

/**
 * The Customer answers a transfer Operations proposed — `M2-BE-545`.
 *
 * **Accepting settles the delta structurally, and there is no checkout here.**
 * In one server transaction every unfinished milestone refunds what was funded
 * and unearned, drops back to `REQUIRED`, and is repriced to the replacement's
 * number, with `amendment_delta_paise` moving by exactly the difference. The
 * money asked for afterwards is the **ordinary stage funding that was always
 * going to be asked for**, at the price just accepted — which is what stops
 * anybody paying twice, and why a screen that presented a transfer payment would
 * be inventing a charge.
 *
 * **The engagement returns to `PENDING_START` and `work_may_start_at` is
 * cleared**, so the whole engagement read moves and not just this record. The
 * replacement has nothing funded and no clearance; funding the first milestone
 * restarts the work exactly as it did at the start of the project.
 *
 * ## The key carries the decision
 *
 * `execute_idempotent` fingerprints the payload, so one key across a changed
 * mind would be refused as key reuse with a different body. Scoping the stored
 * key by the answer means a dropped connection replays the *same* decision,
 * while a Customer who declines and then accepts sends a genuinely new command
 * and gets the server's own state machine as the reply — the same reasoning
 * `useRespondToAttendance` records, and the reason `useAcceptAmendment` and
 * `useDeclineAmendment` are two hooks rather than one flag.
 *
 * No auto-retry. `409 m2_amendment_not_actionable` means it was decided,
 * expired, or the unfinished work changed after it was priced;
 * `409 m2_stage_disputed` means a milestone was disputed in between. All three
 * are answered by re-reading, which `onSettled` does.
 */
export function useDecideTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: TransferDecisionInput) =>
      request(() =>
        getApiClient().POST("/api/v1/project-transfers/{project_transfer_id}/decision/", {
          params: {
            path: { project_transfer_id: input.transferId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-project-transfer:${input.transferId}:${input.accept ? "accept" : "decline"}`,
              ),
            },
          },
          body: { accept: input.accept },
        }),
      ),
    onSettled: (_data, _error, input) => invalidateProject(queryClient, input.engagementId),
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   Answering a delay claim — the Customer's half of `M2-BE-544`
   -------------------------------------------------------------------------- */

export interface DelayClaimDecisionInput {
  /** Only so the engagement and its project read can be refetched. */
  engagementId: string;
  delayClaimId: string;
  accept: boolean;
  /** The Customer's own words. Optional on the wire; the panel asks for them on a refusal. */
  note: string;
}

/**
 * The Customer answers a vendor's delay claim.
 *
 * This surface exists because Wave A5P found the hole and logged it in §7: the
 * command is published as the **Customer's** and `ProjectPlan.delay_claims` is
 * published for them to read, and no wave owned the screen. That is not a
 * cosmetic gap. `sweep_delay_claims` expires an unanswered claim and the agreed
 * dates stand — silence is a refusal, deliberately, so that a vendor cannot move
 * somebody's schedule by filing on a Friday afternoon. A refusal-by-silence is
 * only a protection if the Customer was asked; without a screen it is a deadline
 * running against somebody who was never shown it, and the vendor's legitimate
 * claims expire alongside the opportunistic ones.
 *
 * ## Accepting moves more than the milestone it is about
 *
 * `_shift_schedule_from` moves **this milestone and every one after it** by
 * `extension_days`, because a project is a sequence: a week lost on the first fix
 * is a week lost on everything that follows. The panel says so before the tap
 * rather than after, which is the whole of `M2-FE-707`'s rule applied on the
 * Customer's side of the same product.
 *
 * A milestone with no date is left without one rather than given one. `original_terms`
 * is untouched either way, so the date agreed and the date now due are both
 * readable and their difference is the extension somebody accepted.
 *
 * ## No money, on either answer
 *
 * There is no amount on the request, none on the record, and none in this hook.
 * A delay that costs money is extra work, and extra work goes through the
 * amendment engine where the Customer accepts a price. One command that could do
 * both would let "the site was locked" arrive as a bill.
 *
 * ## The key carries the decision
 *
 * `execute_idempotent` fingerprints the payload, so one key across a changed mind
 * would be refused as key reuse with a different body. Scoping the stored key by
 * the answer means a dropped connection replays the *same* decision, while a
 * Customer who rejects and then accepts sends a genuinely new command and gets
 * the server's own state machine as the reply — `useDecideTransfer`'s reasoning,
 * and the reason `useAcceptAmendment` and `useDeclineAmendment` are two hooks.
 *
 * The note is deliberately **not** in the key. It is the Customer's wording of an
 * answer they have already chosen, and a corrected typo is not a different
 * command.
 *
 * No auto-retry. `409 m2_amendment_not_actionable` means decided, expired, or
 * swept while the page was open; all three are answered by re-reading, which
 * `onSettled` does.
 */
export function useDecideDelayClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DelayClaimDecisionInput) =>
      request(() =>
        getApiClient().POST("/api/v1/project-delay-claims/{delay_claim_id}/decision/", {
          params: {
            path: { delay_claim_id: input.delayClaimId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-delay-claim:${input.delayClaimId}:${input.accept ? "accept" : "reject"}`,
              ),
            },
          },
          body: { accept: input.accept, note: input.note },
        }),
      ),
    onSettled: (_data, _error, input) => invalidateProject(queryClient, input.engagementId),
    retry: false,
  });
}
