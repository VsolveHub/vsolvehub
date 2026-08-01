"use client";

import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import { queryKeys } from "@vsolve/query";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * Operations' partner-review commands.
 *
 * Both operations are commands, not CRUD: a reviewer changes an application's
 * status by naming the transition they intend and the version they saw. There is
 * no endpoint that writes a status field directly, and there should not be.
 *
 * ## What is missing
 *
 * The contract publishes both *actions* but no way to **find** an application:
 * there is no `GET /operations/partner-applications/`. A reviewer can therefore
 * act on an application whose id they already have and cannot discover the queue
 * they are supposed to work through. Raised in proposal 0003 §C.
 */

type Application = Schemas["PartnerApplication"];

export function isVersionConflict(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 409;
}

/** A reviewer's decision has been refused because they lack the permission. */
export function isForbidden(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 403;
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
              ...(input.reason ? { reason: input.reason } : {}),
            },
          },
        ),
      ),
    onSuccess: (application: Application) => {
      queryClient.setQueryData(
        queryKeys.operations.partnerApplication(application.id),
        application,
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

export interface DocumentReviewInput {
  documentId: string;
  /** The application to refresh afterwards; the endpoint returns only the document. */
  applicationId: string;
  decision: Schemas["DecisionEnum"];
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
              ...(input.reason ? { reason: input.reason } : {}),
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
