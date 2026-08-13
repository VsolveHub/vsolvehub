"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getStableIdempotencyKey, request } from "@vsolve/api-client";
import {
  M2_FRESHNESS,
  isNoSelection,
  m2AccessKeys,
  m2QueryKeys,
  shouldRetryM2Read,
  type CustomerProposal,
  type CustomerQuoteList,
  type ProposalSelection,
  type RejectionReason,
} from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

/**
 * Reading, refusing and choosing — contract 1.24.0.
 *
 * `GET /requirements/{id}/quotes/` and the three commands that act on one quote:
 * reject, re-validate and select.
 *
 * ## The read enforces entitlement rather than shortening the payload
 *
 * A Customer who has not paid gets `403 m2_unlock_required` (A3) or `409
 * m2_visit_plan_required` (A5) — **not a thinner quote**. That is the stronger
 * design and it is why this file has no "partial quote" shape: a client cannot
 * un-receive a payload, and a redacted-but-delivered quote is one `fields` edit
 * away from being a full one.
 *
 * Contact details are absent at every status, including after payment. They are
 * released by the engagement and not by the fee.
 *
 * ## Estimates are readable in full, and there is no second paywall
 *
 * `M2-FE-423`. Under revision 3 the A5 visit plan **is** the access fee: once it
 * is charged, every estimate it produced is readable — scope, working days,
 * material lines, taxes, exclusions, warranty and total. Nothing in this file
 * gates any part of a delivered estimate, and a screen that added one would be
 * building revision 2.
 */

export type { CustomerProposal, CustomerQuoteList, ProposalSelection };

/* --------------------------------------------------------------------------
   Reads
   -------------------------------------------------------------------------- */

/**
 * The full quotes or estimates — `M2-FE-407`, `M2-FE-423`.
 *
 * `enabled` is the caller's entitlement decision, taken from
 * `can_read_full_quotes` (A3) or `can_read_full_estimates` (A5) on the access
 * read. Calling it unentitled is not harmful — the server refuses — but it puts
 * a `403` in the console on the ordinary pre-payment path and turns a normal
 * state into something that looks like a fault.
 */
export function useCustomerQuotes(requirementId: string | null, enabled = true) {
  return useQuery({
    queryKey: m2AccessKeys.quotes(requirementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/requirements/{requirement_id}/quotes/", {
          params: { path: { requirement_id: requirementId! } },
        }),
      ),
    enabled: requirementId !== null && enabled,
    // Validity elapses. A quote shown after its `valid_until` is a price nobody
    // stands behind, and `EXPIRED` is a status the server sets rather than
    // something a browser clock should be deciding.
    ...M2_FRESHNESS.proposals,
    retry: shouldRetryM2Read,
  });
}

/**
 * The live selection, or `null` — `M2-FE-411`, `M2-FE-414`.
 *
 * **`404` is "nothing has been chosen", not a failure.** It is the ordinary
 * state of every requirement before somebody picks a vendor, so it is turned
 * into `null` here rather than reaching a screen as an error. Anything else is
 * left to throw.
 */
export function useSelection(requirementId: string | null, enabled = true) {
  return useQuery({
    queryKey: m2AccessKeys.selection(requirementId ?? ""),
    queryFn: async (): Promise<ProposalSelection | null> => {
      try {
        return await request(() =>
          getApiClient().GET("/api/v1/requirements/{requirement_id}/selection/", {
            params: { path: { requirement_id: requirementId! } },
          }),
        );
      } catch (error) {
        if (isNoSelection(error)) return null;
        throw error;
      }
    },
    enabled: requirementId !== null && enabled,
    // Carries `reconfirm_by`, a deadline the server enforces. Rendering an
    // expired one as actionable is an invitation to click something refused.
    ...M2_FRESHNESS.proposals,
    retry: shouldRetryM2Read,
  });
}

/* --------------------------------------------------------------------------
   Commands
   -------------------------------------------------------------------------- */

export interface RejectQuoteInput {
  requirementId: string;
  proposalId: string;
  reason: RejectionReason;
  note: string;
}

/**
 * Rejects one quote — `M2-FE-406`.
 *
 * Two reasons and they are not variations of one another. `NOT_CHOSEN` is
 * bookkeeping. `NON_RESPONSIVE` says the quote ignored the stated scope or is a
 * placeholder: it releases that vendor's slot and buys a replacement **at no
 * extra charge** — a new quote slot on A3, a free replacement visit on A5 — up
 * to a configured cap.
 *
 * The reason is in the idempotency key because they are different commands with
 * different consequences. Sharing one key would let a double press that started
 * as `NOT_CHOSEN` replay when the Customer meant `NON_RESPONSIVE`, and the
 * second is the one that spends an allowance.
 *
 * `409 m2_policy_unavailable` is reachable here on a well-formed request and is
 * the whole reason the control is gated on a non-null allowance: the cap is an
 * owner decision, and the server refuses rather than promising a replacement on
 * a rule that does not exist.
 */
export function useRejectQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RejectQuoteInput) =>
      request(() =>
        getApiClient().POST(
          "/api/v1/requirements/{requirement_id}/quotes/{proposal_id}/reject/",
          {
            params: {
              path: { requirement_id: input.requirementId, proposal_id: input.proposalId },
              header: {
                "Idempotency-Key": getStableIdempotencyKey(
                  `m2-quote-reject:${input.proposalId}:${input.reason}`,
                ),
              },
            },
            body: { reason: input.reason, note: input.note },
          },
        ),
      ),
    // A non-responsive rejection releases a slot and triggers a replacement, so
    // the list changes shape rather than one row changing status — and on A5 the
    // visit plan gains a replacement slot. `M2_INVALIDATION`'s `reject_proposal`
    // says the same thing about the requirement scope.
    onSuccess: (_proposal: CustomerProposal, input) => {
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.requirements.detail(input.requirementId),
      });
      void queryClient.invalidateQueries({ queryKey: m2AccessKeys.quotes(input.requirementId) });
      void queryClient.invalidateQueries({ queryKey: m2AccessKeys.teasers(input.requirementId) });
    },
    retry: false,
  });
}

export interface RevalidateQuoteInput {
  requirementId: string;
  proposalId: string;
}

/**
 * Asks a vendor to re-state an expired price — `M2-FE-413`.
 *
 * **Charges nothing and reuses the unlock or plan already paid for.** Expiry
 * must not be a dead end that forces a second purchase, and that guarantee is
 * the entire content of the control: one tap, no money, no new entitlement.
 *
 * The vendor answers by superseding. The expired revision stays readable and
 * stays unselectable, because only a vendor can state a price — so the screen
 * shows a request in flight rather than a quote that has quietly refreshed
 * itself.
 */
export function useRevalidateQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RevalidateQuoteInput) =>
      request(() =>
        getApiClient().POST(
          "/api/v1/requirements/{requirement_id}/quotes/{proposal_id}/revalidate/",
          {
            params: {
              path: { requirement_id: input.requirementId, proposal_id: input.proposalId },
              header: {
                "Idempotency-Key": getStableIdempotencyKey(
                  `m2-quote-revalidate:${input.proposalId}`,
                ),
              },
            },
          },
        ),
      ),
    onSuccess: (_proposal: CustomerProposal, input) => {
      void queryClient.invalidateQueries({ queryKey: m2AccessKeys.quotes(input.requirementId) });
    },
    retry: false,
  });
}

export interface SelectProposalInput {
  requirementId: string;
  proposalId: string;
}

/**
 * Chooses one vendor — `M2-FE-410`, `M2-FE-414`.
 *
 * **Selection is not a booking.** It starts the vendor's reconfirmation clock,
 * and the engagement opens only when they commit. Every screen downstream of
 * this renders `PENDING_RECONFIRMATION` as waiting, never as confirmed.
 *
 * Keyed on the requirement *and* the proposal: choosing a different vendor is a
 * different decision and must not replay the first one's answer.
 *
 * `m2_selection_conflict` is retryable in the contract's own words — another
 * session selected first and **the answer changes on its own** — so the recovery
 * is a re-read, which `onSettled` performs, and not a resend of the same choice.
 */
export function useSelectProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SelectProposalInput) =>
      request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/selection/", {
          params: {
            path: { requirement_id: input.requirementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-selection:${input.requirementId}:${input.proposalId}`,
              ),
            },
          },
          body: { proposal_id: input.proposalId },
        }),
      ),
    onSettled: (_data, _error, input) => {
      // On success *and* on refusal. A conflict means somebody else's selection
      // is now the truth, and the screen has to be re-rendered from it rather
      // than from what this tab believed a moment ago.
      void queryClient.invalidateQueries({
        queryKey: m2AccessKeys.selection(input.requirementId),
      });
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.requirements.detail(input.requirementId),
      });
      void queryClient.invalidateQueries({ queryKey: m2AccessKeys.quotes(input.requirementId) });
    },
    retry: false,
  });
}
