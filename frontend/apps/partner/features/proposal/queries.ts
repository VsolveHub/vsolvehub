"use client";

import {
  ApiRequestError,
  clearIdempotencyKey,
  getStableIdempotencyKey,
  request,
  type Schemas,
} from "@vsolve/api-client";
import { M2_FRESHNESS, invalidateForM2Command, m2QueryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * Submitting, reading and withdrawing this vendor's own quotes (contract 1.24.0).
 *
 * `M2-FE-308..313`, `M2-FE-315`. There is no patch and no delete, and a revision
 * is another `POST /proposals/` rather than an edit — `submit_proposal` marks the
 * previous row `SUPERSEDED` and creates a new one, so what the customer was
 * originally offered survives a dispute.
 *
 * ## The list read exists now, and it closes the largest hole in Wave B2
 *
 * At 1.21.0 there was no way to answer "which proposal did I send for this
 * enquiry": submit, read-by-id and withdraw, and `EnquiryDetail` carried
 * questions and site visits but no proposal. A vendor could submit a quote and
 * reach it only by remembering its id, so withdraw, the eight proposal states
 * and the whole supersession trace ended when the tab closed.
 *
 * **`GET /api/v1/proposals/` (`m2_proposal_list`) is published at 1.24.0** — a
 * cursor page scoped to the caller with an optional `requirement` filter. It
 * mounts on `m2QueryKeys.proposals.mine(requirementId)`, which the frozen key
 * factory has held for exactly this since Wave 0, so nothing about the
 * invalidation table changes.
 *
 * The `requirement` filter narrows a set the caller already owns — the queryset
 * is scoped to their own proposals *first* — so it cannot be used to discover a
 * request they were never invited to.
 *
 * ## Idempotency
 *
 * `submit` and `withdraw` both require `Idempotency-Key`. A submit's key is
 * scoped to the invitation *and the revision it is replacing*, so a retry after
 * a lost response replays the same logical submission, while a deliberate
 * revision the vendor writes afterwards is a genuinely new command with a
 * genuinely new key. Scoping it to the invitation alone would make every
 * revision a replay of the first quote — the customer would never see the second
 * one, and nothing would report an error.
 */

export type Proposal = Schemas["Proposal"];
export type ProposalCreateRequest = Schemas["ProposalCreateRequest"];
export type ProposalPreviewRequest = Schemas["ProposalPreviewRequest"];
export type ProposalFinancialSummary = Schemas["ProposalFinancialSummary"];

/**
 * The key for one logical submission.
 *
 * `supersedes` is the revision number this submission replaces — `0` for a first
 * quote. Two vendors' concurrent revisions never collide because the key is
 * minted per browser, and the same vendor's retry of revision 2 reuses it.
 */
export function submitProposalKey(input: {
  invitationId: string;
  supersedesRevision: number;
}): string {
  return getStableIdempotencyKey(
    `m2-proposal-submit:${input.invitationId}:r${input.supersedesRevision}`,
  );
}

export function withdrawProposalKey(proposalId: string): string {
  return getStableIdempotencyKey(`m2-proposal-withdraw:${proposalId}`);
}

/**
 * One quote, by id.
 *
 * Only reachable while the id is in hand — this session's own submission, or a
 * navigation that carried it. Mounted anyway rather than left to the mutation
 * result alone, because a quote's `status` moves without the vendor: the
 * customer selects or rejects it, and `expired_proposal_ids` sweeps a lapsed
 * `valid_until`. `EXPIRING_STATE` for exactly that reason.
 */
export function useProposal(proposalId: string | null) {
  return useQuery({
    queryKey: m2QueryKeys.proposals.detail(proposalId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/proposals/{proposal_id}/", {
          params: { path: { proposal_id: proposalId as string } },
        }),
      ),
    enabled: proposalId !== null && proposalId !== "",
    ...M2_FRESHNESS.proposals,
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && [401, 403, 404].includes(error.status)
        ? false
        : failureCount < 2,
  });
}

/**
 * One page of this vendor's own quotes, plus whether the server is holding more.
 *
 * Projected down to what the screens use, on the `readEnquiryPage` precedent: a
 * non-null `next` keeps carrying a truncation notice until the cursor is
 * threaded through, rather than a silently short list.
 */
export interface ProposalPage {
  readonly results: readonly Proposal[];
  readonly next: string | null;
}

/**
 * This vendor's quotes for one requirement — every revision, append-only.
 *
 * Scoped by requirement rather than by invitation because that is the filter the
 * server publishes; a vendor re-invited on a second wave holds two invitations
 * on one requirement, and the screen narrows to its own with
 * `proposal-state.traceForInvitation`. Doing that narrowing client-side costs
 * one comparison and avoids a second endpoint.
 *
 * `EXPIRING_STATE` through `M2_FRESHNESS.proposals`: a quote's `status` moves
 * without the vendor — the customer selects, rejects or lets it lapse, and
 * `expired_proposal_ids` sweeps a lapsed `valid_until` — so a cached list is a
 * list of commitments that may already have been decided.
 */
export function useMyProposals(requirementId: string, enabled = true) {
  return useQuery({
    queryKey: m2QueryKeys.proposals.mine(requirementId),
    queryFn: async (): Promise<ProposalPage> => {
      const page = await request(() =>
        getApiClient().GET("/api/v1/proposals/", {
          params: { query: { requirement: requirementId } },
        }),
      );
      return { results: page.results, next: page.next };
    },
    enabled: enabled && requirementId !== "",
    ...M2_FRESHNESS.proposals,
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && [401, 403, 404].includes(error.status)
        ? false
        : failureCount < 2,
  });
}

/**
 * Server-authoritative estimate arithmetic for the exact visible draft.
 *
 * Preview is a POST because the body is too rich for a query string, but it is
 * still a read: TanStack Query deduplicates equal drafts and the caller debounces
 * before enabling it. The full serialized body participates in the key so a
 * previous total can never enable Send for newer inputs.
 */
export function useProposalFinancialPreview(input: {
  invitationId: string;
  fingerprint: string;
  body: ProposalPreviewRequest | null;
}) {
  return useQuery<ProposalFinancialSummary>({
    queryKey: m2QueryKeys.proposals.preview(input.invitationId, input.fingerprint),
    queryFn: () =>
      request(() =>
        getApiClient().POST("/api/v1/proposals/preview/", {
          body: input.body as ProposalPreviewRequest,
        }),
      ),
    enabled: input.body !== null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 5 * 60 * 1000,
    retry: false,
  });
}

export interface SubmitProposalInput {
  readonly body: ProposalCreateRequest;
  /** The revision being replaced. `0` for a first quote. Keys the idempotency scope. */
  readonly supersedesRevision: number;
  /** Scopes cache invalidation. Opaque — never used to fetch the requirement. */
  readonly requirementId: string;
  readonly invitationId: string;
}

/**
 * Send a quote, or a revision that supersedes this vendor's previous one.
 *
 * The 201 carries the whole `Proposal`, including the server's own
 * `total_paise`, `revision` and `usability` — so the screen renders the server's
 * arithmetic rather than the local computation that produced the request. That
 * is the `M2-FE-312` guarantee in practice: what the vendor sees after
 * submitting is what Django stored.
 *
 * The enquiry moves to `QUOTED` as a side effect, so its cache is invalidated
 * too. Without that the enquiry keeps offering Decline, which
 * `decline_invitation` would refuse with "Withdraw the quote instead".
 */
export function useSubmitProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SubmitProposalInput) =>
      request(() =>
        getApiClient().POST("/api/v1/proposals/", {
          params: {
            header: {
              "Idempotency-Key": submitProposalKey({
                invitationId: input.invitationId,
                supersedesRevision: input.supersedesRevision,
              }),
            },
          },
          body: input.body,
        }),
      ),
    onSuccess: async (proposal, input) => {
      queryClient.setQueryData(m2QueryKeys.proposals.detail(proposal.id), proposal);
      clearIdempotencyKey(
        `m2-proposal-submit:${input.invitationId}:r${input.supersedesRevision}`,
      );
      await invalidateForM2Command(
        queryClient,
        input.supersedesRevision > 0 ? "supersede_proposal" : "submit_proposal",
        { requirementId: input.requirementId, invitationId: input.invitationId },
      );
      await queryClient.invalidateQueries({
        queryKey: m2QueryKeys.invitations.detail(input.invitationId),
      });
    },
    // A submitted quote is a commercial commitment. An automatic retry would
    // send a second one under a key the vendor never asked to replay, and the
    // ambiguous case — a timeout after Django committed — is resolved by
    // re-reading the enquiry's status, not by sending again.
    retry: false,
  });
}

export interface WithdrawProposalInput {
  readonly proposalId: string;
  readonly requirementId: string;
}

/**
 * Take a live quote off the table.
 *
 * `withdraw_proposal` moves `SUBMITTED` only and answers with the withdrawn
 * record, so the new status is written straight back. The enquiry is left alone:
 * withdrawing does not release the invitation, which stays `QUOTED`.
 */
export function useWithdrawProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: WithdrawProposalInput) =>
      request(() =>
        getApiClient().POST("/api/v1/proposals/{proposal_id}/withdraw/", {
          params: {
            path: { proposal_id: input.proposalId },
            header: { "Idempotency-Key": withdrawProposalKey(input.proposalId) },
          },
        }),
      ),
    onSuccess: async (proposal, input) => {
      queryClient.setQueryData(m2QueryKeys.proposals.detail(proposal.id), proposal);
      clearIdempotencyKey(`m2-proposal-withdraw:${input.proposalId}`);
      await invalidateForM2Command(queryClient, "withdraw_proposal", {
        requirementId: input.requirementId,
        proposalId: input.proposalId,
      });
    },
    retry: false,
  });
}

export interface DeclineRevisionInput {
  readonly proposalId: string;
  readonly requestId: string;
  readonly requirementId: string;
  readonly note: string;
}

/**
 * Say no to a customer's requested change; the estimate stands as sent.
 *
 * Accepting the request is not a separate command — a revision (`POST
 * /proposals/`) supersedes the estimate and answers the request in one step.
 */
export function useDeclineRevisionRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DeclineRevisionInput) =>
      request(() =>
        getApiClient().POST(
          "/api/v1/proposals/{proposal_id}/revision-requests/{request_id}/decline/",
          {
            params: { path: { proposal_id: input.proposalId, request_id: input.requestId } },
            body: { note: input.note },
          },
        ),
      ),
    onSuccess: async (_declined, input) => {
      await queryClient.invalidateQueries({
        queryKey: m2QueryKeys.proposals.mine(input.requirementId),
      });
      await queryClient.invalidateQueries({
        queryKey: m2QueryKeys.proposals.detail(input.proposalId),
      });
    },
    retry: false,
  });
}

/* ---------------------------------------------------------------------------
   Refusals worth naming
   --------------------------------------------------------------------------- */

/**
 * The quote does not match the requirement's lifecycle, the stage amounts do not
 * reconcile, or another vendor already fixed the tax basis.
 *
 * One code, three causes, and the server's message is the only thing that
 * distinguishes them — so it is always shown verbatim rather than replaced with
 * a client sentence.
 */
export function isProposalShapeRefusal(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_proposal_invalid_shape";
}

/** The Customer committed the request elsewhere before this stale composer submitted. */
export function isProposalWindowClosed(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_proposal_window_closed";
}

/** The daily rate is below the statutory floor, or no floor could be loaded. */
export function isWageFloorRefusal(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.code === "m2_proposal_below_wage_floor" || error.code === "m2_wage_floor_unavailable")
  );
}

/** Quoting needs an accepted enquiry, and this one is not accepted any more. */
export function isNotQuotable(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.status === 409 || error.code === "m2_invitation_expired")
  );
}

/** Belongs to another Partner, or this session holds no Partner profile. */
export function isProposalForbidden(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 403 || error.status === 404);
}
