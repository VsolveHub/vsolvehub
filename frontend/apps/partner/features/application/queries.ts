"use client";

import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import { SESSION_STATE, queryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The Partner application's server reads and writes.
 *
 * Everything here is a published contract operation, so it goes through the
 * generated client and there is no quarantine.
 *
 * ## Optimistic concurrency is the theme
 *
 * Every mutation carries `expected_version`, and Django answers `409` when the
 * application has moved on. That is not an edge case in onboarding: Operations
 * can request changes, reject a document or suspend an account while the Partner
 * has the form open. So each mutation below reads the version from cache, and a
 * conflict refetches rather than retrying — retrying a stale version would just
 * conflict again, and forcing the write through would silently overwrite a
 * reviewer's decision.
 */

type Application = Schemas["PartnerApplication"];

export function usePartnerApplication() {
  return useQuery({
    queryKey: queryKeys.partner.application(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/application/")),
    // The application changes when the Partner edits it or a reviewer acts. It
    // is not volatile, but it is not static either — a Partner who leaves the
    // tab open overnight should not act on yesterday's status.
    ...SESSION_STATE,
    // A Partner with no application yet gets a 404, which is a valid state
    // ("you have not started"), not an error to retry.
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && error.status === 404 ? false : failureCount < 2,
  });
}

/** True when the failure was a version conflict rather than anything else. */
export function isVersionConflict(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 409;
}

/**
 * Reads the version to send with a mutation.
 *
 * From the cache rather than from component state: a component that captured the
 * version on mount would send a stale one after any successful save.
 */
function useCurrentVersion(): () => number | undefined {
  const queryClient = useQueryClient();
  return () =>
    queryClient.getQueryData<Application>(queryKeys.partner.application())?.version;
}

/**
 * Applies a server response to the cache.
 *
 * Every mutation returns the whole application at its new version, so writing it
 * back directly means the next mutation already has the right version without a
 * refetch round-trip.
 */
function useApplyResult() {
  const queryClient = useQueryClient();
  return (application: Application) => {
    queryClient.setQueryData(queryKeys.partner.application(), application);
  };
}

export type ApplicationPatch = Omit<
  Schemas["PatchedPartnerApplicationUpdateRequest"],
  "expected_version"
>;

export function useUpdateApplication() {
  const queryClient = useQueryClient();
  const currentVersion = useCurrentVersion();
  const applyResult = useApplyResult();

  return useMutation({
    mutationFn: (patch: ApplicationPatch) =>
      request(() =>
        getApiClient().PATCH("/api/v1/partner/application/", {
          body: { ...patch, expected_version: currentVersion() },
        }),
      ),
    onSuccess: applyResult,
    onError: (error) => {
      // A conflict means someone else moved the application. Refetching is the
      // only honest recovery: the Partner needs to see the new state before
      // deciding whether their edit still makes sense.
      if (isVersionConflict(error)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.partner.application() });
      }
    },
    // Never retried automatically. A retry would either conflict again or, worse,
    // succeed against a version the Partner never saw.
    retry: false,
  });
}

export interface DocumentUpload {
  kind: Schemas["PartnerDocumentKindEnum"];
  /** Storage key returned by the signed upload, not a browser blob URL. */
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  /** Hex SHA-256 of the uploaded bytes, so the server can verify what landed. */
  sha256: string;
}

export function useUploadDocumentMetadata() {
  const queryClient = useQueryClient();
  const currentVersion = useCurrentVersion();

  return useMutation({
    mutationFn: (upload: DocumentUpload) =>
      request(() =>
        getApiClient().POST("/api/v1/partner/application/documents/", {
          body: {
            expected_version: currentVersion() as number,
            kind: upload.kind,
            object_key: upload.objectKey,
            content_type: upload.contentType,
            size_bytes: upload.sizeBytes,
            sha256: upload.sha256,
          },
        }),
      ),
    // Returns the document, not the application, so the application is refetched
    // to pick up its new version and the document in its list.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.partner.application() });
    },
    retry: false,
  });
}

export function useSubmitApplication() {
  const queryClient = useQueryClient();
  const currentVersion = useCurrentVersion();
  const applyResult = useApplyResult();

  return useMutation({
    mutationFn: () =>
      request(() =>
        getApiClient().POST("/api/v1/partner/application/submit/", {
          body: { expected_version: currentVersion() as number },
        }),
      ),
    onSuccess: applyResult,
    onError: (error) => {
      if (isVersionConflict(error)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.partner.application() });
      }
    },
    retry: false,
  });
}

/* -------------------------------------------------------------------------
   Availability
   ------------------------------------------------------------------------- */

export function usePartnerAvailability() {
  return useQuery({
    queryKey: queryKeys.partner.availability(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/availability/")),
    ...SESSION_STATE,
  });
}

export type SchedulePayload = Schemas["PartnerScheduleUpdateRequest"];

/**
 * Replaces the whole schedule.
 *
 * A whole-schedule PUT rather than per-rule edits, matching the contract. This
 * is the right shape for the domain too: availability is a set of periods that
 * must be consistent with each other, and a partial edit that leaves two rules
 * overlapping is not a state the Partner should be able to reach.
 */
export function useUpdateAvailability() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SchedulePayload) =>
      request(() =>
        getApiClient().PUT("/api/v1/partner/availability/", { body: payload }),
      ),
    onSuccess: (schedule) => {
      queryClient.setQueryData(queryKeys.partner.availability(), schedule);
    },
    retry: false,
  });
}
