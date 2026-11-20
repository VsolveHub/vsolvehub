"use client";

import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import { SESSION_STATE, VOLATILE_STATE, cursorFromNextUrl, queryKeys } from "@vsolve/query";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * Operations' partner-review commands.
 *
 * Both operations are commands, not CRUD: a reviewer changes an application's
 * status by naming the transition they intend and the version they saw. There is
 * no endpoint that writes a status field directly, and there should not be.
 *
 * Contract 1.5.0 added the reads a reviewer needs to *find* work — a cursor-
 * paginated queue, an application detail, and ownership through claim — so the
 * console is no longer limited to acting on an id somebody handed over.
 */

type Application = Schemas["PartnerApplication"];

/**
 * Two reviewers acted on the same version: the only refusal a refetch fixes.
 *
 * By code, not by status. Every domain refusal on this endpoint is a 409 —
 * documents not yet approved, an incomplete application, a review claimed by
 * someone else — and reading them all as "someone else acted first" told a
 * reviewer to wait out a problem only they could fix.
 */
export function isVersionConflict(error: unknown): boolean {
  return (
    error instanceof ApiRequestError && error.code === "partner_application_version_conflict"
  );
}

/** Someone else holds the review. Shown as "claimed first", like a version conflict. */
export function isClaimedElsewhere(error: unknown): boolean {
  return (
    isVersionConflict(error) ||
    (error instanceof ApiRequestError && error.code === "partner_review_ownership_conflict")
  );
}

/** A reviewer's decision has been refused because they lack the permission. */
export function isForbidden(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 403;
}

/**
 * The reviewer is the applicant.
 *
 * Distinct from an ordinary permission denial because the recovery is different
 * and the wording must be too: nobody can grant you the right to approve your
 * own Partner record, so "ask your team lead" would be wrong advice.
 */
export function isSelfReview(error: unknown): boolean {
  return (
    error instanceof ApiRequestError && error.code === "partner_self_review_forbidden"
  );
}

export type ApplicantTrack = Schemas["TrackEnum"];

export interface QueueFilters {
  status?: "SUBMITTED" | "UNDER_REVIEW" | "CHANGES_REQUIRED";
  assignedToMe?: boolean;
  unassigned?: boolean;
  /** One kind of applicant. Combines with the others; left out, every kind is listed. */
  track?: ApplicantTrack;
}

/**
 * The review queue, page by page.
 *
 * Cursor pagination rather than offsets, which is what the contract publishes
 * and what a queue needs: applications are submitted while a reviewer is
 * working, and an offset would silently skip or repeat rows as the list shifts
 * underneath them.
 *
 * `VOLATILE_STATE` because another reviewer claiming an item changes who should
 * be looking at it. A stale queue is how two people open the same application.
 */
export function useApplicationQueue(filters: QueueFilters = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.operations.partnerApplicationQueue(filters),
    queryFn: ({ pageParam }) =>
      request(() =>
        getApiClient().GET("/api/v1/operations/partner-applications/", {
          params: {
            query: {
              ...(filters.status ? { status: filters.status } : {}),
              ...(filters.assignedToMe ? { assigned_to_me: true } : {}),
              ...(filters.unassigned ? { unassigned: true } : {}),
              ...(filters.track ? { track: filters.track } : {}),
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      ),
    initialPageParam: "",
    getNextPageParam: (lastPage) => cursorFromNextUrl(lastPage.next),
    ...VOLATILE_STATE,
  });
}

export function useApplicationDetail(applicationId: string | null) {
  return useQuery({
    queryKey: queryKeys.operations.partnerApplication(applicationId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/partner-applications/{application_id}/", {
          params: { path: { application_id: applicationId as string } },
        }),
      ),
    enabled: applicationId !== null,
    ...SESSION_STATE,
  });
}

export interface ClaimInput {
  applicationId: string;
  /** The version the reviewer saw in the queue when they clicked. */
  expectedVersion: number;
}

/**
 * Takes ownership of an application.
 *
 * Carries `expected_version` like every other command here, and for the same
 * reason: two reviewers clicking Claim on the same row is precisely the race
 * ownership exists to settle, so the loser must be told rather than silently
 * overwrite the winner.
 *
 * A failed claim must never look like a successful one, so the queue and the
 * detail are refetched on either outcome — the reviewer then sees who actually
 * holds it.
 */
export function useClaimApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ClaimInput) =>
      request(() =>
        getApiClient().POST(
          "/api/v1/operations/partner-applications/{application_id}/claim/",
          {
            params: { path: { application_id: input.applicationId } },
            body: { expected_version: input.expectedVersion },
          },
        ),
      ),
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.operations.partnerApplication(input.applicationId),
      });
      // Ownership is what the queue displays, so every filtered view of it is
      // now out of date.
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.operations.all, "partner-application-queue"],
      });
    },
    retry: false,
  });
}

/**
 * Hands a claimed application back to the queue so another reviewer can claim it.
 *
 * Any Operations user may release, not only the holder: it exists for the
 * reviewer who is away, whose applications nobody else could otherwise touch.
 */
export function useReleaseApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ClaimInput) =>
      request(() =>
        getApiClient().POST(
          "/api/v1/operations/partner-applications/{application_id}/release/",
          {
            params: { path: { application_id: input.applicationId } },
            body: { expected_version: input.expectedVersion },
          },
        ),
      ),
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.operations.partnerApplication(input.applicationId),
      });
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.operations.all, "partner-application-queue"],
      });
    },
    retry: false,
  });
}

/**
 * Requests a short-lived URL for one KYC document.
 *
 * A **mutation**, not a query, and deliberately so. Every call is an audited
 * disclosure of someone's identity document, and the URL expires. Caching it
 * would both hide reveals from the audit trail and hand out a link after it
 * stopped working.
 *
 * The returned URL is never persisted anywhere — it goes straight to an
 * `<img>`/`<iframe>` in component state and dies with the component.
 */
export function useRevealDocument() {
  return useMutation({
    mutationFn: (documentId: string) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/partner-documents/{document_id}/access/", {
          params: { path: { document_id: documentId } },
        }),
      ),
    retry: false,
  });
}

export interface TransitionInput {
  applicationId: string;
  targetStatus: Schemas["TargetStatusEnum"];
  /** Required for the decisions that say so; see `model/decisions.ts`. */
  reason?: string;
  /** The version the reviewer was looking at when they decided. */
  expectedVersion: number;
}

export function useTransitionApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: TransitionInput) =>
      request(() =>
        getApiClient().POST(
          "/api/v1/operations/partner-applications/{application_id}/transition/",
          {
            params: { path: { application_id: input.applicationId } },
            body: {
              expected_version: input.expectedVersion,
              target_status: input.targetStatus,
              // Always sent: an empty string is "no reason", which the decisions
              // that need one refuse on the server with a message to read.
              reason: input.reason ?? "",
            },
          },
        ),
      ),
    onSuccess: (application: Application) => {
      // The decision's response is the plain application; the reviewer's detail also carries the
      // employer hints and checks, which a decision does not change. Merge, so they are not lost.
      queryClient.setQueryData(
        queryKeys.operations.partnerApplication(application.id),
        (previous: Application | undefined) => ({ ...previous, ...application }),
      );
    },
    onError: (error, input) => {
      // Two reviewers had the same application open. Refetching is the only
      // honest recovery — the second reviewer has to see what the first decided
      // before repeating their own decision on top of it.
      if (isVersionConflict(error)) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.operations.partnerApplication(input.applicationId),
        });
      }
    },
    // Never retried. A retried transition is a second decision on someone's
    // livelihood, taken without anyone choosing to take it.
    retry: false,
  });
}

export interface EmployerCheckInput {
  applicationId: string;
  code: Schemas["EmployerCheckCodeEnum"];
  result: Schemas["ResultEnum"];
  /** Required by the server for a failed check; the reviewer's reason, kept in the record. */
  note?: string;
}

/**
 * Passes or fails one manual check on an employer application.
 *
 * Only the reviewer holding the application may; the server refuses anyone else. The checks are
 * part of the application detail, so it is refetched on either outcome: a refused write must not
 * leave a tick on screen that the server did not record.
 */
export function useSetEmployerCheck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: EmployerCheckInput) =>
      request(() =>
        getApiClient().PUT(
          "/api/v1/operations/partner-applications/{application_id}/employer-checks/{code}/",
          {
            params: { path: { application_id: input.applicationId, code: input.code } },
            body: { result: input.result, note: input.note ?? "" },
          },
        ),
      ),
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.operations.partnerApplication(input.applicationId),
      });
    },
    retry: false,
  });
}

export interface DocumentReviewInput {
  documentId: string;
  /** The application to refresh afterwards; the endpoint returns only the document. */
  applicationId: string;
  decision: Schemas["OperationsDocumentReviewDecisionEnum"];
  /**
   * Why it was rejected.
   *
   * Reaches the Partner verbatim, so a rejection without one leaves them
   * re-uploading the same unusable photo. Enforced at the call site.
   */
  reason?: string;
}

export function useReviewDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DocumentReviewInput) =>
      request(() =>
        getApiClient().POST(
          "/api/v1/operations/partner-documents/{document_id}/review/",
          {
            params: { path: { document_id: input.documentId } },
            body: {
              decision: input.decision,
              reason: input.reason ?? "",
            },
          },
        ),
      ),
    // Returns the document alone, so the application is refetched to pick up its
    // new version — which the next transition will need.
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.operations.partnerApplication(input.applicationId),
      });
    },
    retry: false,
  });
}
