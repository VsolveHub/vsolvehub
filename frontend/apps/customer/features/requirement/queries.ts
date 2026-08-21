"use client";

import {
  ApiRequestError,
  clearIdempotencyKey,
  getStableIdempotencyKey,
  request,
} from "@vsolve/api-client";
import {
  M2_FRESHNESS,
  m2QueryKeys,
  isAttachmentInvalid,
  isAttachmentUnavailable,
  readRequirementList,
  shouldRetryM2Read,
  type ProbableDuplicate,
  type RequirementAttachment,
  type RequirementDraft,
  type RequirementSubmitted,
  type RequirementSummary,
  type RequirementTimeline,
} from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";
import {
  isUploadExpired,
  sha256Hex,
  type UploadProgress,
  type UploadableAttachmentKind,
} from "./model/upload";

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
 * - **Merge.** `GAP-004` asks for a merge and no endpoint implements one, so the
 *   duplicate notice offers the honest thing it can do instead — open the
 *   request that already exists. Logged in the execution plan §7.
 * - **Teasers, unlock and selection.** Published or not, they are Wave A2 and
 *   Wave A2 has no domain layer behind it. `GET /quotes/teasers/` exists; the
 *   count the tracking screens need is already on the summary, so calling it
 *   here would be building A2 early with none of its states.
 */

export type {
  ProbableDuplicate,
  RequirementAttachment,
  RequirementDraft,
  RequirementSummary,
  RequirementTimeline,
};

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

/** The newest editable draft for this service from the newest-first request list. */
export function existingDraftId(
  requests: readonly RequirementSummary[],
  serviceSlug: string,
): string | null {
  return (
    requests.find(
      (requirement) =>
        requirement.status === "DRAFT" && requirement.category_slug === serviceSlug,
    )?.id ?? null
  );
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
 * `m2QueryKeys.requirements.duplicates` took `{addressId, serviceBy,
 * categorySlug}` — the shape proposal 0012 requested. The published endpoint
 * matches on `address_id`, `requested_start` and `variant_id` instead: a
 * date-time rather than a date, and the variant rather than the category. The
 * values were always passed through correctly under the old labels; the
 * integrator renamed the frozen key's slots at the wave gate, so the pass-through
 * is now direct and the §7 request is closed.
 */
export function useProbableDuplicates(input: DuplicateCheckInput | null) {
  return useQuery({
    queryKey: m2QueryKeys.requirements.duplicates({
      addressId: input?.addressId ?? "",
      requestedStart: input?.requestedStart ?? "",
      variantId: input?.variantId ?? "",
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
 * Called at an explicit boundary — Continue, See my live rate, or Review and
 * send — never from a service-card press or an address default. The draft turns
 * local intent into something `PATCH` can address, and the response carries the
 * inferred lifecycle and any missing required answers.
 *
 * `POST /requirements/` takes no client idempotency header. Django serializes
 * creation per Customer and variant instead: it answers `200` with the existing
 * editable draft or `201` with a new one. That server invariant is what makes a
 * reload, second tab, or missed list cache safe.
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
   Attachments — `M2-FE-204`, `M2-FE-205`
   -------------------------------------------------------------------------- */

/**
 * Why an attachment attempt stopped, as something the row can act on.
 *
 * `retryable` is decided here, at the one place that knows which step failed,
 * rather than inferred from an HTTP status three layers up. `m2_attachment_
 * unavailable` (503) is the only retryable refusal the contract publishes on
 * this path; everything else that is retryable is a transport failure, and
 * `m2_attachment_invalid` (400) never is — the file itself is the problem and
 * resending the same bytes fails identically.
 */
export class AttachmentUploadFailure extends Error {
  readonly retryable: boolean;
  /** True once the bytes are in storage, so a retry only has to finalize again. */
  readonly bytesStored: boolean;

  constructor(message: string, options: { retryable: boolean; bytesStored: boolean }) {
    super(message);
    this.name = "AttachmentUploadFailure";
    this.retryable = options.retryable;
    this.bytesStored = options.bytesStored;
  }
}

/**
 * PUTs the bytes to storage, reporting progress. Resolves on a 2xx only.
 *
 * `XMLHttpRequest` rather than `fetch` for one reason: `fetch` cannot report
 * upload progress — no shipping browser exposes `onprogress` for a request body
 * — and an 80 MB site video over a phone connection is exactly the case where a
 * progress bar is the difference between waiting and tapping again. Copied in
 * approach from `apps/partner/features/application/upload-queries.ts`, which
 * solved the same problem for KYC documents; the two apps do not share code, so
 * the reasoning is repeated rather than imported.
 */
function putBytes(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("content-type", contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      // Storage answers 401/403 for a signature that has expired. Retryable,
      // because the recovery is a fresh presign and the same bytes.
      reject(
        new AttachmentUploadFailure(
          xhr.status === 401 || xhr.status === 403
            ? "That upload link expired before the file finished sending."
            : "The upload did not reach our storage.",
          { retryable: true, bytesStored: false },
        ),
      );
    };
    xhr.onerror = () =>
      reject(
        new AttachmentUploadFailure("The upload could not reach our storage.", {
          retryable: true,
          bytesStored: false,
        }),
      );
    xhr.onabort = () =>
      reject(
        new AttachmentUploadFailure("The upload was cancelled.", {
          retryable: true,
          bytesStored: false,
        }),
      );

    xhr.send(body);
  });
}

/**
 * The idempotency key for finalizing one upload intent.
 *
 * Keyed on the **upload id**, not on the attempt. Django fingerprints the
 * payload under a reused key and replays the persisted `201`, so a finalize that
 * is retried after a dropped connection returns the attachment the first attempt
 * created rather than creating a second one. That is the whole handling of "a
 * finalize that arrives twice", and it only works if the key is derived from
 * something stable — a fresh key per press would produce two attachments for one
 * file.
 */
export function attachmentFinalizeKey(uploadId: string): string {
  return getStableIdempotencyKey(`m2-requirement-attachment-finalize:${uploadId}`);
}

/** A live presign, kept on the row so a retry does not always start from scratch. */
export interface AttachmentUploadIntent {
  uploadId: string;
  uploadUrl: string;
  expiresAt: string;
  /** True once `putBytes` has succeeded against this intent. */
  bytesStored: boolean;
}

export interface AttachmentUploadInput {
  requirementId: string;
  kind: UploadableAttachmentKind;
  /** Normalised media type, sent to the presign *and* on the `PUT`. */
  contentType: string;
  body: Blob;
  /** BCP-47 for a voice note; empty for everything else. */
  language: string;
  /**
   * A presign this row already holds.
   *
   * Supplied on a retry. When it is still live and its bytes are already stored,
   * the whole transfer is skipped and only the finalize runs — under the same
   * idempotency key, so a finalize that in fact succeeded the first time is
   * replayed rather than repeated.
   */
  intent?: AttachmentUploadIntent | null;
  onProgress?: (progress: UploadProgress) => void;
  /** Called as soon as a presign exists, so a retry can resume from it. */
  onIntent?: (intent: AttachmentUploadIntent) => void;
}

function refusalToFailure(error: unknown, bytesStored: boolean): AttachmentUploadFailure {
  if (error instanceof AttachmentUploadFailure) return error;
  if (isAttachmentUnavailable(error)) {
    return new AttachmentUploadFailure(
      "Attachments are temporarily unavailable. Try again in a moment.",
      { retryable: true, bytesStored },
    );
  }
  if (isAttachmentInvalid(error)) {
    return new AttachmentUploadFailure(
      error instanceof ApiRequestError
        ? error.message
        : "We could not accept that file.",
      { retryable: false, bytesStored },
    );
  }
  if (error instanceof ApiRequestError && error.status === 409) {
    // `m2_requirement_locked`: the requirement left DRAFT while the file was in
    // flight. Nothing about that changes on a second attempt.
    return new AttachmentUploadFailure(
      "This request has already gone to professionals, so files can no longer be added to it.",
      { retryable: false, bytesStored },
    );
  }
  return new AttachmentUploadFailure("The upload did not finish.", {
    retryable: true,
    bytesStored,
  });
}

/**
 * Presign, transfer, finalize — one mutation, because the three steps are not
 * independently useful.
 *
 * An intent that is never finalized is an orphan Django's housekeeping sweep has
 * to collect, and a caller able to invoke the steps separately would eventually
 * leave one behind.
 *
 * ## What a retry actually re-does
 *
 * Only what failed. If the bytes are already in storage against a live intent,
 * the retry finalizes that intent again under its own key — Django replays the
 * original `201`, so the row is updated rather than duplicated. If the intent
 * expired, or the transfer never completed, the whole handshake runs again with
 * a fresh key. The difference matters on a phone: re-sending 80 MB to recover
 * from a finalize that timed out is a minute of somebody's data for nothing.
 *
 * ## Nothing is retried automatically
 *
 * `retry: false`. The transfer can be genuinely expensive and the refusals that
 * matter are not transient; both are retried by an explicit press, so the person
 * knows a second attempt is happening.
 */
export function useUploadAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AttachmentUploadInput): Promise<RequirementAttachment> => {
      const report = (progress: UploadProgress) => input.onProgress?.(progress);

      let intent = input.intent ?? null;
      if (intent !== null && isUploadExpired(intent.expiresAt)) intent = null;

      if (intent === null || !intent.bytesStored) {
        if (intent === null) {
          report({ phase: "hashing", percent: 0 });
          const sha256 = await sha256Hex(input.body).catch(() => {
            throw new AttachmentUploadFailure(
              "This browser cannot check the file before sending it, so we did not send it.",
              { retryable: false, bytesStored: false },
            );
          });

          report({ phase: "requesting", percent: 0 });
          const grant = await request(() =>
            getApiClient().POST("/api/v1/requirements/{requirement_id}/attachments/uploads/", {
              params: { path: { requirement_id: input.requirementId } },
              body: {
                kind: input.kind,
                content_type: input.contentType,
                size_bytes: input.body.size,
                sha256,
                language: input.language,
              },
            }),
          ).catch((error: unknown) => {
            throw refusalToFailure(error, false);
          });

          // A deadline already in the past means the clock or the round trip is
          // badly off. Sending bytes at it would waste the whole transfer.
          if (isUploadExpired(grant.upload_expires_at)) {
            throw new AttachmentUploadFailure(
              "That upload link expired before it could be used. Try again.",
              { retryable: true, bytesStored: false },
            );
          }

          intent = {
            uploadId: grant.id,
            uploadUrl: grant.upload_url,
            expiresAt: grant.upload_expires_at,
            bytesStored: false,
          };
          input.onIntent?.(intent);
        }

        report({ phase: "uploading", percent: 0 });
        await putBytes(intent.uploadUrl, input.body, input.contentType, (percent) =>
          report({ phase: "uploading", percent }),
        );
        intent = { ...intent, bytesStored: true };
        input.onIntent?.(intent);
      }

      report({ phase: "finalizing", percent: 100 });
      const uploadId = intent.uploadId;
      const attachment = await request(() =>
        getApiClient().POST("/api/v1/requirements/{requirement_id}/attachments/", {
          params: {
            path: { requirement_id: input.requirementId },
            header: { "Idempotency-Key": attachmentFinalizeKey(uploadId) },
          },
          body: { upload_id: uploadId },
        }),
      ).catch((error: unknown) => {
        // The intent is spent either way once Django has refused it on its
        // merits, so the stored key goes with it — keeping it would make a later
        // upload of a different file replay this refusal.
        if (isAttachmentInvalid(error)) {
          clearIdempotencyKey(`m2-requirement-attachment-finalize:${uploadId}`);
        }
        throw refusalToFailure(error, true);
      });

      clearIdempotencyKey(`m2-requirement-attachment-finalize:${uploadId}`);
      return attachment;
    },

    // The requirement's own record carries `attachments`, and it is the only
    // thing that knows the scan verdict. Refetched on success and on failure
    // alike: a finalize that failed at the client may still have landed.
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.requirements.detail(input.requirementId),
      });
    },

    retry: false,
  });
}

export interface RemoveAttachmentInput {
  requirementId: string;
  attachmentId: string;
}

/**
 * Deletes an attachment and the stored object behind it.
 *
 * Permitted while the requirement is a draft — and, for an `INFECTED`
 * attachment, **in any status at all**. That exception is deliberate on the
 * server and it is the reason removal is the only recovery this client ever
 * offers for malware: a rejected file must never be stuck on a live requirement
 * because the edit window closed.
 *
 * A `404` is treated as success by the caller rather than as an error. The row
 * is gone, which is what the press asked for; reporting a failure would leave a
 * row on screen for a record that no longer exists.
 */
export function useRemoveAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RemoveAttachmentInput) =>
      request(() =>
        getApiClient().DELETE("/api/v1/requirements/{requirement_id}/attachments/{attachment_id}/", {
          params: {
            path: {
              requirement_id: input.requirementId,
              attachment_id: input.attachmentId,
            },
          },
        }),
      ),
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.requirements.detail(input.requirementId),
      });
    },
    retry: false,
  });
}

/** `404` on a delete: already gone, which is the outcome that was asked for. */
export function isAlreadyRemoved(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
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
