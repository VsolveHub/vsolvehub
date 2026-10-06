// Ported from frontend/apps/partner/features/engagement/queries.ts

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
  type AmendmentDraft,
  type AmendmentShape,
  type EngagementAmendment,
  type EvidenceUploadKind,
  type StageEvidence,
  toAmendmentLineRequests,
} from "@vsolve/query/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@vsolve/mobile-core";
import { sha256Hex } from "@/features/application/model/upload";

/**
 * The vendor's engagement reads and commands — contract 1.25.0.
 *
 * `M2-FE-501`, `M2-FE-601..604`, `M2-FE-607`. The rules live in
 * `@vsolve/query`'s `m2-engagement-partner`; this file is the wiring.
 *
 * ## One list endpoint, two workspaces
 *
 * `GET /engagements/` serves both the workforce Shifts list and the project
 * Stages list, and it takes **no archetype filter** — so the split is the same
 * one the enquiry inbox makes: one read, and the client separates by a published
 * server value (`commercial_mode`) rather than by inferring a lifecycle from a
 * category or a profession.
 *
 * ## About the `role` parameter
 *
 * `m2_engagement_list`'s description says a `role` query parameter picks Customer
 * or Partner, **and the parameter is not declared in the schema** — the view
 * reads `request.query_params.get("role")` while `@extend_schema` publishes only
 * `cursor`, so the generated client has no way to send it. The default is
 * relied on instead: with no `role`, Django answers with the Partner's
 * engagements whenever the caller has a partner profile. Every route that mounts
 * this sits behind `WorkspaceRoute`, which has already read
 * `GET /partner/workspaces/` and been given a grant — which is itself proof the
 * profile exists — so the default resolves the way this app needs. Logged in
 * `frontend-execution-plan.md` §7; the fix is one declared parameter.
 *
 * ## Commands are idempotent, and none of them retries
 *
 * Every state-changing call here carries a stable `Idempotency-Key` scoped to the
 * record and the command, kept across rerenders and failures and cleared only on
 * success. `retry: false` throughout, for the reason the enquiry inbox learned:
 * an automatic retry invents a second attempt nobody asked for, and the two
 * refusals this wave adds — `m2_stage_transition_not_allowed` and
 * `m2_amendment_not_actionable` — both mean *the record moved*, which no retry
 * fixes and a re-read does.
 */

export type Engagement = Schemas["Engagement"];
export type EngagementStage = Schemas["EngagementStage"];
export type ProjectCompletionCodeEntry = Schemas["ProjectCompletionCodeEntryRequest"];

/* --------------------------------------------------------------------------
   Reads
   -------------------------------------------------------------------------- */

export interface EngagementListPage {
  readonly results: readonly Engagement[];
  /** Non-null when the server holds older engagements this build cannot ask for. */
  readonly next: string | null;
}

/**
 * Every engagement this vendor is performing.
 *
 * `VOLATILE_STATE` rather than `EXPIRING_STATE`: an engagement carries no
 * deadline whose passing invalidates the list, unlike an invitation. The clocks
 * that matter — the review window and the payout hold — live on the stage, and
 * the stage read takes the stricter tier.
 *
 * **Not polled.** An engagement moves when somebody does a day's work or a
 * customer makes a decision; a timer against that is thousands of requests to
 * observe something that changes once a day. Focus and reconnect revalidation
 * carry it.
 */
export function usePartnerEngagements(enabled = true) {
  return useQuery({
    queryKey: m2QueryKeys.engagements.list("partner"),
    queryFn: async (): Promise<EngagementListPage> => {
      const page = await request(() => getApiClient().GET("/api/v1/engagements/", {}));
      return { results: page.results, next: page.next };
    },
    enabled,
    ...M2_FRESHNESS.engagementList,
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && [400, 401, 403, 404].includes(error.status)
        ? false
        : failureCount < 2,
  });
}

/**
 * One agreement and its ordered stages.
 *
 * Read on its own rather than picked out of the list, because the list row *is*
 * the whole engagement — but a detail opened from a notification months later has
 * no list behind it, and a screen that only works when you arrived from the index
 * is a screen that breaks on a shared link.
 */
export function usePartnerEngagement(engagementId: string, enabled = true) {
  return useQuery({
    queryKey: m2QueryKeys.engagements.detail(engagementId),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/engagements/{engagement_id}/", {
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

/*
 * There is deliberately no `usePartnerStage`.
 *
 * `GET /engagement-stages/{id}/` exists and nothing in this column mounts it: the
 * engagement read already embeds its ordered `stages[]`, and every screen here
 * opens from the engagement rather than from a bare stage id. A second read of
 * the same rows would be a second copy that can disagree with the first, and a
 * cache key for it would have to invent an engagement id — the stage routes carry
 * only `stage_id` in the path, while `m2QueryKeys.engagements.stage()` takes both.
 * Mount it if a stage ever gets its own URL; until then it would be a read whose
 * only job is to go stale.
 */

/** The agreement's own history — both parties read the same rows. */
export function usePartnerEngagementEvents(engagementId: string, enabled = true) {
  return useQuery({
    queryKey: [...m2QueryKeys.engagements.detail(engagementId), "events"] as const,
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/engagements/{engagement_id}/events/", {
          params: { path: { engagement_id: engagementId } },
        }),
      ),
    enabled: enabled && engagementId !== "",
    ...M2_FRESHNESS.engagementDetail,
    retry: false,
  });
}

/**
 * Change requests on this engagement, live and historical.
 *
 * On `m2QueryKeys.engagements.agreement(id)` — the key the frozen factory
 * describes as "the immutable agreement and its amendment history". An amendment
 * is the only thing that moves the agreed number, so it belongs in that prefix
 * and an engagement-wide invalidation clears it.
 */
export function usePartnerEngagementAmendments(engagementId: string, enabled = true) {
  return useQuery({
    queryKey: m2QueryKeys.engagements.agreement(engagementId),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/engagements/{engagement_id}/amendments/", {
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
   Cache writes
   -------------------------------------------------------------------------- */

/**
 * Writes a stage command's answer straight into the caches it moved.
 *
 * Every stage command answers with the whole `EngagementStage`, so the new state
 * is in hand and the screen renders it on the frame the button settles rather
 * than flashing a skeleton over the record the vendor just moved. The engagement
 * detail carries the embedded `stages[]` every screen here reads, so that is what
 * is patched. The list is a sibling key and is invalidated separately by each
 * command, because a stage moving changes which bucket its engagement sits in.
 */
function useApplyStage(engagementId: string) {
  const queryClient = useQueryClient();

  return (stage: EngagementStage) => {
    queryClient.setQueryData<Engagement>(
      m2QueryKeys.engagements.detail(engagementId),
      (engagement) =>
        engagement
          ? {
              ...engagement,
              stages: engagement.stages.map((row) => (row.id === stage.id ? stage : row)),
            }
          : engagement,
    );
  };
}

/**
 * Re-reads instead of guessing.
 *
 * A failed command may or may not have applied — a timeout after Django
 * committed looks identical to one before it — and both new refusals mean the
 * record moved. The stable idempotency key is deliberately **not** cleared here:
 * clearing it would mint a new key on the vendor's own retry and turn one logical
 * command into two.
 */
function useRereadEngagement(engagementId: string) {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({
      queryKey: m2QueryKeys.engagements.detail(engagementId),
    });
    void queryClient.invalidateQueries({ queryKey: m2QueryKeys.engagements.all });
  };
}

/* --------------------------------------------------------------------------
   Stage commands
   -------------------------------------------------------------------------- */

/**
 * Begin work. `PENDING → IN_PROGRESS`, and out of a correction too.
 *
 * On a well-behaved A5 flow this is an idempotent no-op — the funding callback
 * has already moved a funded stage to `IN_PROGRESS` — which is why the button
 * exists on both archetypes and is not archetype-branched. Reaching it on an
 * unfunded managed stage is `m2_stage_not_funded`, and that is a fact about the
 * customer's payment, not about this vendor.
 */
export function useStartStage(engagementId: string) {
  const queryClient = useQueryClient();
  const applyStage = useApplyStage(engagementId);
  const reread = useRereadEngagement(engagementId);

  return useMutation({
    mutationFn: (input: { readonly stageId: string }) =>
      request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/start/", {
          params: {
            path: { stage_id: input.stageId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(`m2-stage-start:${input.stageId}`),
            },
          },
        }),
      ),
    onSuccess: async (stage, input) => {
      applyStage(stage);
      clearIdempotencyKey(`m2-stage-start:${input.stageId}`);
      // The hand-written `engagements.all` that used to live here is **gone**:
      // `start_stage` landed in `M2Command` at the Gate 3 integration and
      // resolves to `stageScope`, which is `[engagements.detail,
      // engagements.all]`. `all` is a prefix of `detail`, so the row is a strict
      // superset of the single key this used to clear — and the list is still
      // what has to move, because starting a shift-day takes its booking out of
      // "coming up".
      await invalidateForM2Command(queryClient, "start_stage", {
        engagementId,
        stageId: input.stageId,
      });
    },
    onError: reread,
    retry: false,
  });
}

/**
 * Hand the stage to the customer. `IN_PROGRESS → AWAITING_REVIEW`.
 *
 * The note is **required** and is not a caption on the files: it is stored as its
 * own append-only `NOTE` evidence row, so a correction cycle leaves both accounts
 * readable — what the vendor said the first time, and what they said after the
 * customer pushed back. Resubmitting restarts the review window from zero,
 * because the customer is looking at different evidence.
 *
 * The idempotency key is scoped to the stage **and** the number of submissions
 * already on it, so a retry of one submission replays and a deliberate
 * resubmission after a correction is a new logical command rather than a replay
 * of the first one.
 */
export function useSubmitStageEvidence(engagementId: string) {
  const queryClient = useQueryClient();
  const applyStage = useApplyStage(engagementId);
  const reread = useRereadEngagement(engagementId);

  return useMutation({
    mutationFn: (input: {
      readonly stageId: string;
      readonly note: string;
      readonly submissionOrdinal: number;
    }) =>
      request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/submit/", {
          params: {
            path: { stage_id: input.stageId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `m2-stage-submit:${input.stageId}:${input.submissionOrdinal}`,
              ),
            },
          },
          body: { note: input.note.trim() },
        }),
      ),
    onSuccess: async (stage, input) => {
      applyStage(stage);
      clearIdempotencyKey(`m2-stage-submit:${input.stageId}:${input.submissionOrdinal}`);
      // The hand-written `engagements.all` that used to live here is gone.
      // `submit_stage_evidence` is a real `M2Command` row and `stageScope` was
      // fixed at the Wave B3 gate to return `[engagements.detail, engagements.all]`,
      // so the command now clears both the detail this screen reads through and
      // the sibling list buckets — submitting moves the engagement from "your
      // move" to "with the customer", which is a list-level change the detail
      // patch above cannot express.
      await invalidateForM2Command(queryClient, "submit_stage_evidence", {
        engagementId,
        stageId: input.stageId,
      });
    },
    onError: reread,
    retry: false,
  });
}

/* --------------------------------------------------------------------------
   Evidence upload — presign, PUT, finalize
   -------------------------------------------------------------------------- */

export type EvidenceUploadPhase =
  | "hashing"
  | "requesting"
  | "uploading"
  | "finalizing"
  | "done";

export interface EvidenceUploadProgress {
  readonly phase: EvidenceUploadPhase;
  readonly percent: number;
}

export type EvidenceFailureReason =
  | "expired"
  | "network"
  | "rejected"
  | "not_accepting"
  | "storage"
  | "unknown";

export class EvidenceUploadFailure extends Error {
  readonly reason: EvidenceFailureReason;

  constructor(reason: EvidenceFailureReason, message: string) {
    super(message);
    this.name = "EvidenceUploadFailure";
    this.reason = reason;
  }
}

/**
 * PUTs the bytes to storage, reporting progress.
 *
 * `XMLHttpRequest` rather than `fetch` for the same reason the KYC uploader uses
 * it: no shipping browser reports progress for a `fetch` request body, and a
 * video of a finished milestone over a site's mobile connection is exactly the
 * case where a progress bar is the difference between waiting and re-tapping.
 */
function putEvidenceBytes(
  url: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("content-type", contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      // Storage answers 401/403 for a signature that has expired. Retryable by
      // asking for a fresh grant and resending — never by resending to the same
      // dead URL.
      reject(
        new EvidenceUploadFailure(
          xhr.status === 401 || xhr.status === 403 ? "expired" : "network",
          `Storage refused the upload (${xhr.status}).`,
        ),
      );
    };

    xhr.onerror = () =>
      reject(new EvidenceUploadFailure("network", "The upload could not reach storage."));
    xhr.onabort = () =>
      reject(new EvidenceUploadFailure("network", "The upload was cancelled."));

    xhr.send(file);
  });
}

function evidenceFailure(error: unknown): EvidenceUploadFailure {
  if (error instanceof EvidenceUploadFailure) return error;
  if (error instanceof ApiRequestError) {
    if (error.code === "m2_stage_transition_not_allowed") {
      return new EvidenceUploadFailure(
        "not_accepting",
        "This stage no longer accepts evidence. Open it again to see where it got to.",
      );
    }
    if (error.code === "m2_attachment_unavailable" || error.status === 503) {
      return new EvidenceUploadFailure(
        "storage",
        "Vsolve's file storage is not answering. Nothing was lost — try the file again.",
      );
    }
    // Django fetched the stored object back and compared it with the intent.
    // Resending the same bytes cannot change that answer.
    return new EvidenceUploadFailure("rejected", error.message);
  }
  return new EvidenceUploadFailure("unknown", "The upload did not complete.");
}

export interface EvidenceUploadInput {
  readonly stageId: string;
  readonly kind: EvidenceUploadKind;
  readonly file: File;
  readonly onProgress?: (progress: EvidenceUploadProgress) => void;
}

/**
 * One file, three steps, one mutation.
 *
 * Kept as one mutation rather than three because the steps are not independently
 * useful: an upload presigned and never finalized is an orphan Django has to
 * clean up, and a caller able to invoke them separately will eventually leave one
 * behind.
 *
 * **`object_key` is never published**, so nothing here builds a URL from a
 * storage path — the finalized `StageEvidence` carries an id, a kind, a size and
 * a scan status, and that is what the history renders. `processing_status` lands
 * `PENDING`: "matches the checksum" and "is safe" are different questions, and
 * the second one is answered later.
 *
 * Nothing is retried automatically. The byte transfer can be genuinely expensive
 * on a phone, and a second attempt should be something a person chose.
 */
export function useUploadStageEvidence(engagementId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: EvidenceUploadInput): Promise<StageEvidence> => {
      const report = (progress: EvidenceUploadProgress) => input.onProgress?.(progress);

      report({ phase: "hashing", percent: 0 });
      const sha256 = await sha256Hex(input.file);

      report({ phase: "requesting", percent: 0 });
      const grant = await request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/evidence/uploads/", {
          params: { path: { stage_id: input.stageId } },
          body: {
            kind: input.kind,
            content_type: input.file.type,
            size_bytes: input.file.size,
            sha256,
          },
        }),
      ).catch((error: unknown) => {
        throw evidenceFailure(error);
      });

      // A deadline already past means the clock or the round trip is badly off.
      // Sending 80 MB at it would waste the whole transfer.
      if (Date.parse(grant.expires_at) <= Date.now()) {
        throw new EvidenceUploadFailure(
          "expired",
          "That upload link expired before it was used. Attach the file again.",
        );
      }

      report({ phase: "uploading", percent: 0 });
      await putEvidenceBytes(grant.upload_url, input.file, input.file.type, (percent) =>
        report({ phase: "uploading", percent }),
      );

      report({ phase: "finalizing", percent: 100 });
      const evidence = await request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/evidence/", {
          params: { path: { stage_id: input.stageId } },
          body: { upload_id: grant.upload_id },
        }),
      ).catch((error: unknown) => {
        throw evidenceFailure(error);
      });

      report({ phase: "done", percent: 100 });
      return evidence;
    },

    // The stage carries the evidence list, so it is refetched whether this
    // succeeded or failed — a failed finalize may still have attached the row.
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.engagements.detail(engagementId),
      });
    },

    retry: false,
  });
}

/* --------------------------------------------------------------------------
   Amendments
   -------------------------------------------------------------------------- */

/**
 * Propose a change to the agreement.
 *
 * The vendor proposes and the customer decides — there is no accept path in this
 * app, and there should not be: `m2_engagement_amendment_decide` is the
 * Customer's route, and a vendor who could accept their own change request could
 * re-price a job somebody already committed to.
 *
 * **Two pricing rules, one command.** On A3 the lines carry days and no money;
 * the server prices them from the worker-day rate frozen at reconfirmation. On A5
 * the lines carry signed amounts and the server sums them — a client total is
 * rejected, and none is sent. `toAmendmentLineRequests` is where that split
 * lives, so the request body cannot carry a figure the pricing rule forbids.
 *
 * ## The idempotency key is derived from the draft, not from an attempt counter
 *
 * `execute_idempotent` rejects a key reused with **different arguments**, so a
 * counter bumped only on success has a trap in it: a vendor whose first proposal
 * is refused, who then edits a line and sends again, would reuse the key with a
 * changed payload and earn a fingerprint conflict instead of a fresh proposal.
 * Keying on the draft's own content gives both halves of what idempotency is for
 * — an identical resend replays, an edited one is a new command — and the
 * "second proposal" case a counter was protecting against is already refused
 * server-side by the one-live-amendment rule.
 */
export function useProposeAmendment(engagementId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      readonly draft: AmendmentDraft;
      readonly shape: AmendmentShape;
    }): Promise<EngagementAmendment> =>
      request(() =>
        getApiClient().POST("/api/v1/engagements/{engagement_id}/amendments/", {
          params: {
            path: { engagement_id: engagementId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                amendmentOperationId(engagementId, input.draft, input.shape),
              ),
            },
          },
          body: {
            kind: input.shape.kind,
            reason: input.draft.reason.trim(),
            ...(input.draft.stageId ? { stage_id: input.draft.stageId } : {}),
            lines: toAmendmentLineRequests({ draft: input.draft, shape: input.shape }),
          },
        }),
      ),
    onSuccess: async (_amendment, input) => {
      clearIdempotencyKey(amendmentOperationId(engagementId, input.draft, input.shape));
      await invalidateForM2Command(queryClient, "propose_amendment", { engagementId });
      await queryClient.invalidateQueries({
        queryKey: m2QueryKeys.engagements.agreement(engagementId),
      });
    },
    onError: () => {
      // `m2_amendment_not_actionable` means one is already open — which this
      // screen believed was not the case. The list is what was wrong.
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.engagements.agreement(engagementId),
      });
    },
    retry: false,
  });
}

/**
 * A stable operation id for one draft.
 *
 * Deterministic over exactly the fields that reach the request body, so two
 * presses of the same unedited form share a key and an edited form does not.
 * Not a hash: the string is short, it never leaves the browser, and a readable
 * key is one a developer can match against a stored entry when something goes
 * wrong.
 */
function amendmentOperationId(
  engagementId: string,
  draft: AmendmentDraft,
  shape: AmendmentShape,
): string {
  const lines = draft.lines
    .map((line) => `${line.title.trim()}|${line.quantity}|${line.amountPaise ?? ""}`)
    .join(";");
  return `m2-amendment:${engagementId}:${shape.kind}:${draft.stageId ?? ""}:${draft.reason.trim()}:${lines}`;
}

/** Close an A5 project only after the Partner enters the Customer-held code. */
export function useCompleteProjectWithCode(engagementId: string) {
  const queryClient = useQueryClient();
  const operationId = `m2-project-completion:${engagementId}`;

  return useMutation({
    mutationFn: (input: ProjectCompletionCodeEntry): Promise<Engagement> =>
      request(() =>
        getApiClient().POST("/api/v1/partner/engagements/{engagement_id}/completion/", {
          params: {
            path: { engagement_id: engagementId },
            header: { "Idempotency-Key": getStableIdempotencyKey(operationId) },
          },
          body: input,
        }),
      ),
    onSuccess: (engagement) => {
      clearIdempotencyKey(operationId);
      queryClient.setQueryData(m2QueryKeys.engagements.detail(engagementId), engagement);
      void queryClient.invalidateQueries({ queryKey: m2QueryKeys.engagements.list("partner") });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: m2QueryKeys.engagements.detail(engagementId) });
    },
    retry: false,
  });
}
