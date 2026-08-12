"use client";

import { ApiRequestError, getStableIdempotencyKey, request } from "@vsolve/api-client";
import {
  M2_FRESHNESS,
  m2QueryKeys,
  readRequirementList,
  shouldRetryM2Read,
  type ProbableDuplicate,
  type RequirementDraft,
  type RequirementSubmitted,
  type RequirementSummary,
  type RequirementTimeline,
} from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The requirement flow's server layer — contract 1.21.0.
 *
 * The first thing in the Customer app to call an M2 endpoint. Everything under
 * `features/requirement/` was built against proposal 0012 and mounted no query
 * for six days; this is the file that turns it on, and the seam held — the
 * screens did not change, only the adapters and this.
 *
 * ## Three decisions taken from `apps/partner/features/workspace/queries.ts`
 *
 * Copied rather than re-derived, because Session B settled them a day earlier
 * and two columns disagreeing about them is worse than either answer:
 *
 * 1. **An unread answer is `null`, never `[]`.** They render identically and
 *    mean opposite things. Here that shows up as `requests: readRequirementList
 *    (query.data)` being reachable only through `query.isSuccess` — an empty
 *    list is "you have not asked for anything yet", and a failed read must never
 *    be able to say that. `RequestsList` decides between them from `error` and
 *    `isPending`, not from `length`.
 * 2. **A 401 or 403 is not retried.** The session is over or the caller is not
 *    who these records belong to; a second attempt reaches the same refusal and
 *    delays the only screen that helps. `shouldRetryM2Read` adds 404 for a
 *    reason specific to this surface — see its own note.
 * 3. **Freshness is chosen, not defaulted.** `M2_FRESHNESS` picks the tier per
 *    read and the choices are argued in `m2-keys.ts`: the timeline is
 *    `EXPIRING_STATE` because it carries the SLA clock, the list and the detail
 *    are `VOLATILE_STATE` because a quote arriving changes them and nothing
 *    about them is worth showing stale.
 *
 * ## Nothing here polls
 *
 * `My requests` and the request detail both observe states that move on the
 * server's schedule — a wave going out, a quote arriving, an SLA passing — and
 * none of them moves in the seconds a screen is open. The delayed-match state
 * that *does* appear without a refetch is derived from the server clock by
 * `useServerCountdown`, which is why it needs no timer here.
 *
 * ## What is deliberately absent
 *
 * - **Attachment upload.** `M2-BE-202` is Wave C1. `RequirementDraft.attachments`
 *   is published read-only and there is no command that creates one, so screen
 *   3's uploader integrates later than the rest of the flow.
 * - **Merge.** `GAP-004` asks for a merge and no endpoint implements one, so the
 *   duplicate notice offers the honest thing it can do instead — open the
 *   request that already exists. Logged in the execution plan §7.
 * - **Teasers, unlock and selection.** Published or not, they are Wave A2 and
 *   Wave A2 has no domain layer behind it. `GET /quotes/teasers/` exists; the
 *   count the tracking screens need is already on the summary, so calling it
 *   here would be building A2 early with none of its states.
 */

export type { ProbableDuplicate, RequirementDraft, RequirementSummary, RequirementTimeline };

/* --------------------------------------------------------------------------
   Reads
   -------------------------------------------------------------------------- */

/**
 * `My requests` — `M2-FE-213`.
 *
 * `readRequirementList` absorbs the one place the server and its own schema
 * disagree: the view paginates and the OpenAPI document declares a bare array.
 * That is a contract defect, not a client preference, and it is recorded in the
 * execution plan §7 rather than being quietly normal.
 */
export function useMyRequests(enabled = true) {
  return useQuery({
    queryKey: m2QueryKeys.requirements.list(),
    queryFn: async () =>
      readRequirementList(await request(() => getApiClient().GET("/api/v1/requirements/"))),
    enabled,
    ...M2_FRESHNESS.requirementList,
    retry: shouldRetryM2Read,
  });
}

/** One requirement's own record — the tracking header and the flow's resume read. */
export function useRequirement(requirementId: string | null) {
  return useQuery({
    queryKey: m2QueryKeys.requirements.detail(requirementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/requirements/{requirement_id}/", {
          params: { path: { requirement_id: requirementId! } },
        }),
      ),
    enabled: requirementId !== null,
    ...M2_FRESHNESS.requirementDetail,
    retry: shouldRetryM2Read,
  });
}

/**
 * What has happened to one requirement — `M2-FE-214`.
 *
 * A separate query from the detail on purpose, and the key is nested under it
 * so a requirement-level invalidation still reaches this. The two fail
 * independently, which is what lets `RequestDetail` show that a request closed
 * even when the record of how it got there will not load.
 */
export function useRequirementTimeline(requirementId: string | null) {
  return useQuery({
    queryKey: m2QueryKeys.requirements.timeline(requirementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/requirements/{requirement_id}/timeline/", {
          params: { path: { requirement_id: requirementId! } },
        }),
      ),
    enabled: requirementId !== null,
    ...M2_FRESHNESS.requirementTimeline,
    retry: shouldRetryM2Read,
  });
}

export interface DuplicateCheckInput {
  addressId: string;
  /** ISO date-time. The server matches on when the work starts, not on the deadline. */
  requestedStart: string;
  variantId: string;
}

/**
 * Probable duplicates for a draft — `M2-FE-210`.
 *
 * Asked only when all three inputs exist, because the endpoint requires all
 * three and a partial question has no answer worth caching.
 *
 * ## The key's field names are stale and the values are right
 *
 * `m2QueryKeys.requirements.duplicates` takes `{addressId, serviceBy,
 * categorySlug}` — the shape proposal 0012 requested. The published endpoint
 * matches on `address_id`, `requested_start` and `variant_id` instead: a
 * date-time rather than a date, and the variant rather than the category. The
 * key factory is frozen (`m2-keys.ts`), so the values are passed through under
 * the old names and the correction is logged in the execution plan §7. The
 * cache is still keyed on exactly the three inputs that decide the answer,
 * which is the property the key exists for — only its labels are wrong.
 */
export function useProbableDuplicates(input: DuplicateCheckInput | null) {
  return useQuery({
    queryKey: m2QueryKeys.requirements.duplicates({
      addressId: input?.addressId ?? "",
      serviceBy: input?.requestedStart ?? "",
      categorySlug: input?.variantId ?? "",
    }),
    queryFn: async () =>
      (
        await request(() =>
          getApiClient().GET("/api/v1/requirements/duplicate-check/", {
            params: {
              query: {
                address_id: input!.addressId,
                requested_start: input!.requestedStart,
                variant_id: input!.variantId,
              },
            },
          }),
        )
      ).probable_duplicates,
    enabled: input !== null,
    ...M2_FRESHNESS.duplicates,
    retry: shouldRetryM2Read,
  });
}

/* --------------------------------------------------------------------------
   Commands
   -------------------------------------------------------------------------- */

/**
 * Creates the server-side draft — the first write in the whole flow.
 *
 * Called once, when the Customer leaves screen 1, not on every keystroke. The
 * draft is what turns local intent into something `PATCH` can address, and the
 * response carries the two things the client cannot compute: the inferred
 * lifecycle's plain sentence, and which required answers are still missing.
 *
 * Not idempotency-keyed, deliberately. `POST /requirements/` takes no
 * `Idempotency-Key` header — a duplicate draft costs nothing, reserves nothing
 * and is never charged for, and the duplicate check (`GAP-004`) is what catches
 * the case that matters. Adding a key the server does not read would be
 * ceremony that looks like a guarantee.
 */
export interface CreateRequirementInput {
  variantId: string;
  answers: Readonly<Record<string, unknown>>;
  language: string;
}

export function useCreateRequirement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRequirementInput) =>
      request(() =>
        getApiClient().POST("/api/v1/requirements/", {
          body: {
            variant_id: input.variantId,
            answers: input.answers,
            language: input.language,
          },
        }),
      ),
    onSuccess: (draft: RequirementDraft) => {
      queryClient.setQueryData(m2QueryKeys.requirements.detail(draft.id), draft);
      void queryClient.invalidateQueries({ queryKey: m2QueryKeys.requirements.list() });
    },
    // A refused create is refused for a reason the Customer has to act on —
    // `m2_lifecycle_not_supported` most often, which no retry improves.
    retry: false,
  });
}

export interface SaveRequirementInput {
  requirementId: string;
  answers?: Readonly<Record<string, unknown>>;
  addressId?: string | null;
  /** ISO date-time. */
  requestedStart?: string | null;
  flexibilityDays?: number;
  /** ISO date. The hard `service_by` (`GAP-001`). */
  serviceBy?: string | null;
  additionalDetails?: string;
  language?: string;
}

/**
 * Saves the draft.
 *
 * Every field is optional and only what changed is sent, because `PATCH` treats
 * an absent key and an explicit `null` differently — sending the whole draft
 * back would clear an address the Customer set on another tab.
 *
 * No retry. A 409 here is `m2_requirement_locked`, meaning the requirement left
 * `DRAFT` while the Customer was typing, and re-sending would apply an edit to
 * a world they never saw. `M2-FE-211` is what that refusal is routed to.
 */
export function useSaveRequirement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveRequirementInput) =>
      request(() =>
        getApiClient().PATCH("/api/v1/requirements/{requirement_id}/", {
          params: { path: { requirement_id: input.requirementId } },
          body: {
            ...(input.answers === undefined ? {} : { answers: input.answers }),
            ...(input.addressId === undefined ? {} : { address_id: input.addressId }),
            ...(input.requestedStart === undefined
              ? {}
              : { requested_start: input.requestedStart }),
            ...(input.flexibilityDays === undefined
              ? {}
              : { flexibility_days: input.flexibilityDays }),
            ...(input.serviceBy === undefined ? {} : { service_by: input.serviceBy }),
            ...(input.additionalDetails === undefined
              ? {}
              : { additional_details: input.additionalDetails }),
            ...(input.language === undefined ? {} : { language: input.language }),
          },
        }),
      ),
    onSuccess: (draft: RequirementDraft) => {
      queryClient.setQueryData(m2QueryKeys.requirements.detail(draft.id), draft);
    },
    onError: (error, input) => {
      // The screen is out of date rather than the Customer being wrong. Re-read
      // so whatever they are shown next is the requirement that actually exists.
      if (error instanceof ApiRequestError && error.status === 409) {
        void queryClient.invalidateQueries({
          queryKey: m2QueryKeys.requirements.detail(input.requirementId),
        });
      }
    },
    retry: false,
  });
}

/**
 * The stable key for submitting one requirement.
 *
 * Keyed on the requirement alone, not on a version. Submission is a
 * once-per-requirement transition — `DRAFT` to `MATCHING` and never back — so
 * every press of "Send this request" for the same requirement *is* the same
 * command, and replaying it is exactly the behaviour wanted after a dropped
 * connection.
 *
 * `allow_duplicate` is deliberately not in the key even though it is in the
 * body. Django compares the payload under a reused key and answers 409
 * `idempotency_key_reused` when it differs, which is the correct outcome:
 * overriding the duplicate warning is a second, different decision and it
 * should not silently replay the first request's answer.
 */
export function submitIntentKey(requirementId: string): string {
  return getStableIdempotencyKey(`m2-requirement-submit:${requirementId}`);
}

export interface SubmitRequirementInput {
  requirementId: string;
  /** Set only after the Customer saw the duplicate and chose to continue. */
  allowDuplicate: boolean;
}

/**
 * Sends the requirement to matching — free, and the end of the four screens.
 *
 * `202`, not `201`: matching is started by an outbox event and reconciled by a
 * worker, so the answer is "we have this" rather than "here are your quotes".
 * `RequirementSubmitted` carries the delivery deadline and `is_free`, and both
 * are read rather than assumed — see `review-screen.tsx`.
 */
export function useSubmitRequirement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SubmitRequirementInput) =>
      request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/submit/", {
          params: {
            path: { requirement_id: input.requirementId },
            header: { "Idempotency-Key": submitIntentKey(input.requirementId) },
          },
          body: { allow_duplicate: input.allowDuplicate },
        }),
      ),
    onSuccess: (submitted: RequirementSubmitted) => {
      // The whole requirement moved: its status, its deadline and its place in
      // the list. `submit_requirement` in the M2 invalidation table says the
      // same thing — everything under `requirements`.
      void queryClient.invalidateQueries({ queryKey: m2QueryKeys.requirements.all });
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.requirements.detail(submitted.id),
      });
    },
    // Never resent under a new key. `idempotency_in_progress` means the first
    // attempt is still running, and a second key would start a second matching
    // run for one requirement.
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   Refusals the screens act on
   -------------------------------------------------------------------------- */

/** `409 idempotency_in_progress` — the submit is already running. Wait and re-read. */
export function isSubmitInProgress(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "idempotency_in_progress";
}

/** `409 m2_requirement_expired` — `service_by` passed while the draft sat open. */
export function isRequirementExpired(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_requirement_expired";
}
