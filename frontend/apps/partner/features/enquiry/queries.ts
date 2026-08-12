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
} from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The Partner's enquiry inbox and the four commands against it (contract 1.21.0).
 *
 * `M2-FE-301..306`. Everything here goes through the generated client — the
 * enquiry paths are published, so proposal 0012's hand-written shapes are not
 * used and `contract-pending/` is not imported.
 *
 * ## What an enquiry is allowed to contain
 *
 * The snapshot the vendor was invited against, and nothing about the customer.
 * `EnquirySummarySerializer` reads `invitation.snapshot`, never the live
 * requirement — so a customer editing their request cannot move the goalposts
 * under a quote in progress — and it carries no name, no address and no contact
 * at any status. That separation is the server's; the job here is never to
 * reconstruct what it withheld. There is no lookup from `requirement_id` to
 * anything: it is an opaque reference used to scope invalidation, never a key
 * into another read.
 *
 * ## Commands are idempotent under a stable key
 *
 * `accept` and `decline` both require `Idempotency-Key`, so the same enquiry and
 * the same command reuse one key across rerenders, refetches, timeouts, lost
 * responses and a refresh within the session. Three consequences, all
 * deliberate and all copied from the A1 offer inbox, which learned them the hard
 * way:
 *
 *  1. `retry: false` on every command. An automatic retry would invent a second
 *     attempt under a key the Partner never asked to replay.
 *  2. An ambiguous failure **re-reads the enquiry** rather than asserting an
 *     outcome. `status` is the only thing that knows.
 *  3. The key is not cleared on failure. Clearing it would mint a new key on the
 *     next attempt and defeat the idempotency it exists for. It is cleared once,
 *     on success, so a *later* deliberate command is a new logical operation.
 *
 * `questions` and `site-visits` take no idempotency key — the contract does not
 * declare the header on either — so duplicate protection for those two is the
 * client's in-flight guard alone. Logged in `frontend-execution-plan.md` §7.
 */

export type EnquirySummary = Schemas["EnquirySummary"];
export type EnquiryDetail = Schemas["EnquiryDetail"];
export type RequirementQuestion = Schemas["RequirementQuestion"];
export type SiteVisit = Schemas["SiteVisit"];

/**
 * One page of enquiries, plus whether the server said there are more.
 *
 * ## The contract and the server used to disagree here. The contract was fixed.
 *
 * `m2_partner_enquiry_list` was declared in `v1.yaml` as a bare
 * `EnquirySummary[]` while `PartnerEnquiryCollectionView.get` returned
 * `EnquiryCursorPagination.get_paginated_response(...)`, i.e.
 * `{next, previous, results}`. The generated type was therefore wrong about the
 * shape of a real response, and code written against it — `data.map(...)` — would
 * have thrown on the first request rather than failed a type check.
 *
 * **Contract 1.23.0 declares `EnquirySummaryPage`** and publishes the `cursor`
 * parameter, so the runtime both-shapes narrowing is deleted and the generated
 * type is trusted — the request in `frontend-execution-plan.md` §7 is answered.
 * This is exactly the "re-point, not rewrite" §2 describes. What survives is the
 * projection down to the two fields the inbox actually uses, so `next` staying
 * non-null keeps carrying the truncation notice until the cursor is threaded
 * through.
 */
export interface EnquiryPage {
  readonly results: readonly EnquirySummary[];
  /** Non-null when the server is holding older enquiries this build cannot ask for. */
  readonly next: string | null;
}

export function readEnquiryPage(page: Schemas["EnquirySummaryPage"]): EnquiryPage {
  return { results: page.results, next: page.next };
}

/**
 * The enquiry inbox.
 *
 * One read serves every bucket. The endpoint takes no status filter, so
 * splitting "waiting for you" from "closed" into separate queries would be two
 * requests for one answer and two chances for them to disagree — the grouping is
 * `enquiry-state.groupIntoBuckets` over a single list.
 *
 * `EXPIRING_STATE` through `M2_FRESHNESS.invitationList`: a response deadline
 * and a quote slot both elapse server-side, and a cached inbox is a list of
 * commitments that may already be gone.
 *
 * **Not polled.** The A1 offer inbox polls because an offer expires in seconds
 * and Celery pushes replacements while the Partner watches. An enquiry deadline
 * runs in business hours, so a five-second poll would be thousands of requests
 * to observe something that moves once a day. Focus and reconnect revalidation
 * carry it.
 */
export function usePartnerEnquiries(enabled = true) {
  return useQuery({
    // One bucket key for one server read. The client-side buckets are
    // presentation over this list, not separate cache entries.
    queryKey: m2QueryKeys.invitations.list("all"),
    queryFn: async () =>
      readEnquiryPage(await request(() => getApiClient().GET("/api/v1/partner/enquiries/"))),
    enabled,
    ...M2_FRESHNESS.invitationList,
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && (error.status === 401 || error.status === 403)
        ? false
        : failureCount < 2,
  });
}

/**
 * One enquiry, with its questions and site visits.
 *
 * Read on its own rather than picked out of the list: the detail carries the
 * snapshot answers, the budget, the clarification thread and the site visits,
 * none of which the list row has. Picking from the list would render a detail
 * screen with four empty sections that look like empty *states*.
 */
export function usePartnerEnquiry(invitationId: string, enabled = true) {
  return useQuery({
    queryKey: m2QueryKeys.invitations.detail(invitationId),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/partner/enquiries/{invitation_id}/", {
          params: { path: { invitation_id: invitationId } },
        }),
      ),
    enabled: enabled && invitationId !== "",
    ...M2_FRESHNESS.invitationDetail,
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && [401, 403, 404].includes(error.status)
        ? false
        : failureCount < 2,
  });
}

/** One stable key per enquiry + command, for the life of that logical command. */
export function enquiryCommandKey(input: {
  invitationId: string;
  command: "accept" | "decline";
}): string {
  return getStableIdempotencyKey(`m2-enquiry:${input.invitationId}:${input.command}`);
}

/**
 * Writes a command's response straight into the caches it just moved.
 *
 * `accept` and `decline` both answer with the whole `EnquiryDetail`, so the new
 * state is already in hand and the screen can render it on the same frame the
 * button settles. The background invalidation that follows is not for this row —
 * it is for the *others*, whose acceptability changed when this one took or
 * released a capacity hold. Without the write first, the Partner watches a
 * skeleton replace the enquiry they just answered.
 */
function useApplyEnquiryResult() {
  const queryClient = useQueryClient();

  return (detail: EnquiryDetail) => {
    queryClient.setQueryData(m2QueryKeys.invitations.detail(detail.id), detail);
    queryClient.setQueryData<EnquiryPage>(m2QueryKeys.invitations.list("all"), (page) =>
      page
        ? {
            ...page,
            results: page.results.map((row) =>
              row.id === detail.id ? { ...row, status: detail.status } : row,
            ),
          }
        : page,
    );
  };
}

/**
 * Re-reads instead of guessing.
 *
 * A failed command may or may not have applied — a timeout after Django
 * committed looks identical to one before it. The inbox and the enquiry both go
 * and look. The stable key is kept, so the Partner's own retry is the same
 * logical command rather than a second one.
 */
function useRereadOnAmbiguity(invitationId: string) {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: m2QueryKeys.invitations.all });
    void queryClient.invalidateQueries({
      queryKey: m2QueryKeys.invitations.detail(invitationId),
    });
  };
}

/**
 * Take a quote slot.
 *
 * The capacity hold is the part worth knowing: `matching.accept_invitation`
 * writes an ACTIVE `CapacityHold` over the requested days, which is why the
 * whole inbox is invalidated on success rather than this row — accepting one
 * enquiry changes which *other* enquiries the Partner can still accept.
 */
export function useAcceptEnquiry(invitationId: string) {
  const queryClient = useQueryClient();
  const applyResult = useApplyEnquiryResult();
  const reread = useRereadOnAmbiguity(invitationId);

  return useMutation({
    mutationFn: () =>
      request(() =>
        getApiClient().POST("/api/v1/partner/enquiries/{invitation_id}/accept/", {
          params: {
            path: { invitation_id: invitationId },
            header: { "Idempotency-Key": enquiryCommandKey({ invitationId, command: "accept" }) },
          },
        }),
      ),
    onSuccess: async (detail) => {
      applyResult(detail);
      clearIdempotencyKey(`m2-enquiry:${invitationId}:accept`);
      await invalidateForM2Command(queryClient, "accept_invitation", { invitationId });
    },
    onError: reread,
    retry: false,
  });
}

export interface DeclineInput {
  readonly reasonCode: string;
}

/** Release the slot, with the reason that makes a replacement invitation useful. */
export function useDeclineEnquiry(invitationId: string) {
  const queryClient = useQueryClient();
  const applyResult = useApplyEnquiryResult();
  const reread = useRereadOnAmbiguity(invitationId);

  return useMutation({
    mutationFn: (input: DeclineInput) =>
      request(() =>
        getApiClient().POST("/api/v1/partner/enquiries/{invitation_id}/decline/", {
          params: {
            path: { invitation_id: invitationId },
            header: { "Idempotency-Key": enquiryCommandKey({ invitationId, command: "decline" }) },
          },
          body: { reason_code: input.reasonCode },
        }),
      ),
    onSuccess: async (detail) => {
      applyResult(detail);
      clearIdempotencyKey(`m2-enquiry:${invitationId}:decline`);
      await invalidateForM2Command(queryClient, "decline_invitation", { invitationId });
    },
    onError: reread,
    retry: false,
  });
}

export interface AskQuestionInput {
  readonly question: string;
}

/**
 * One question, answered once, on the shared timeline.
 *
 * Not a message. `RequirementQuestion` holds a question and at most one answer,
 * `answer_question` refuses a second, and there is no participant list or read
 * state to publish — which is the whole of `SIM-07`. The response is appended to
 * the cached detail rather than triggering a refetch, so the vendor sees their
 * question land where the customer's answer will appear.
 */
export function useAskQuestion(invitationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AskQuestionInput) =>
      request(() =>
        getApiClient().POST("/api/v1/partner/enquiries/{invitation_id}/questions/", {
          params: { path: { invitation_id: invitationId } },
          body: { question: input.question },
        }),
      ),
    onSuccess: (question) => {
      queryClient.setQueryData<EnquiryDetail>(
        m2QueryKeys.invitations.detail(invitationId),
        (detail) =>
          detail ? { ...detail, questions: [...detail.questions, question] } : detail,
      );
    },
    // No idempotency key is declared for this path, so a retry would post the
    // same question twice. The in-flight guard on the composer is the only
    // protection there is; automatic retry would defeat it.
    retry: false,
  });
}

export interface SiteVisitInput {
  readonly feePaise: number;
  readonly adjustsAgainstFinalPrice: boolean;
}

/**
 * Ask for a paid visit before quoting.
 *
 * The fee is the vendor's, not a platform rate: `SiteVisitRequestSerializer`
 * publishes no default and the domain refuses a non-positive fee, so nothing on
 * the server offers a number to show. The screen asks for one.
 *
 * The request is all that exists. `schedule_site_visit` and
 * `complete_site_visit` are implemented in the domain and **published on no
 * route**, so a visit can be asked for and never scheduled or closed. The panel
 * says so rather than rendering a lifecycle it cannot advance.
 */
export function useRequestSiteVisit(invitationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SiteVisitInput) =>
      request(() =>
        getApiClient().POST("/api/v1/partner/enquiries/{invitation_id}/site-visits/", {
          params: { path: { invitation_id: invitationId } },
          body: {
            fee_paise: input.feePaise,
            adjusts_against_final_price: input.adjustsAgainstFinalPrice,
          },
        }),
      ),
    onSuccess: (visit) => {
      queryClient.setQueryData<EnquiryDetail>(
        m2QueryKeys.invitations.detail(invitationId),
        (detail) =>
          detail ? { ...detail, site_visits: [...detail.site_visits, visit] } : detail,
      );
    },
    retry: false,
  });
}

/* ---------------------------------------------------------------------------
   Refusals worth naming
   --------------------------------------------------------------------------- */

/** The response window closed. Never comes back — `errors.ts` categorises it `expired`. */
export function isEnquiryExpired(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_invitation_expired";
}

/** Three vendors already hold the customer's quote slots. */
export function isSlotsExhausted(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_invitation_slots_exhausted";
}

/** Another account with the same beneficial owner already holds a slot here. */
export function isSlotConflict(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_proposal_slot_conflict";
}

/**
 * The progressive-KYC gate, fired at the first accept rather than at
 * registration — which is the whole point of `M2-FE-102`. It is an unfinished
 * form, not a denial.
 */
export function isKycRequired(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_kyc_required";
}

/** The lifecycle capability is not approved, or Operations suspended it. */
export function isCapabilityRefusal(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.code === "m2_capability_not_approved" || error.code === "m2_capability_suspended")
  );
}

/** Belongs to another Partner, or this session holds no Partner profile. */
export function isEnquiryForbidden(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 403 || error.status === 404);
}

/** A same-key request is still running. Wait and re-read; never resend. */
export function isCommandInProgress(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "idempotency_in_progress";
}
