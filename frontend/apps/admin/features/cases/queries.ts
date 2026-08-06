"use client";

import { getStableIdempotencyKey, request, type Schemas } from "@vsolve/api-client";
import { EXPIRING_STATE, cursorFromNextUrl, queryKeys } from "@vsolve/query";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * Operations cases (contract 1.17.0).
 *
 * ## The console never decides how a case may close
 *
 * Each case kind has its own required terminal results, and Django publishes them per case as
 * `allowed_resolutions`. This module renders that list and nothing else. A hardcoded map here
 * would be a second copy of a domain rule, and the first time it drifted a reviewer would be
 * offered a resolution the server refuses — the same failure the Booking Group `recovery_action`
 * field exists to prevent.
 *
 * ## Commands carry the version they were decided against
 *
 * A case moves while somebody is reading it: it gets escalated, claimed, commented on. The
 * idempotency key includes the version, so re-pressing Resolve for the case you were looking at
 * replays, while resolving again after it moved is a different command against a different world.
 */

export type OperationsCase = Schemas["OperationsCase"];
export type OperationsCaseRow = Schemas["OperationsCaseList"];
export type CaseStatus = Schemas["OperationsCaseStatusEnum"];
export type CaseSeverity = Schemas["OperationsCaseSeverityEnum"];

export interface CaseFilters {
  status?: string;
  ownerTeam?: string;
  kind?: string;
  overdue?: boolean;
}

export function useOperationsCases(filters: CaseFilters = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.operations.cases(filters),
    queryFn: async ({ pageParam }) => {
      const page = await request(() =>
        getApiClient().GET("/api/v1/operations/cases/", {
          params: {
            query: {
              ...(filters.status ? { status: filters.status } : {}),
              ...(filters.ownerTeam ? { owner_team: filters.ownerTeam } : {}),
              ...(filters.kind ? { kind: filters.kind } : {}),
              ...(filters.overdue ? { overdue: true } : {}),
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      );
      // Validated while the page is still being accepted, so a broken `next` drives the restart
      // UI rather than silently truncating the queue.
      cursorFromNextUrl(page.next);
      return page;
    },
    initialPageParam: "" as string,
    getNextPageParam: (lastPage) => cursorFromNextUrl(lastPage.next),
    ...EXPIRING_STATE,
  });
}

export function useOperationsCase(caseId: string | null) {
  return useQuery({
    queryKey: queryKeys.operations.case(caseId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/cases/{case_id}/", {
          params: { path: { case_id: caseId! } },
        }),
      ),
    enabled: caseId !== null,
    ...EXPIRING_STATE,
  });
}

function caseCommandKey(action: string, caseId: string, version: number): string {
  return getStableIdempotencyKey(`case-${action}:${caseId}:${version}`);
}

function useCaseCache() {
  const queryClient = useQueryClient();
  return {
    apply(updated: OperationsCase) {
      queryClient.setQueryData(queryKeys.operations.case(updated.id), updated);
      // The queue row changes with it — status, owner, overdue. Invalidated rather than
      // written, because this response knows nothing about the rest of the queue.
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.operations.all, "cases"] });
    },
    refetch(caseId: string) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operations.case(caseId) });
    },
  };
}

interface VersionedCase {
  caseId: string;
  expectedVersion: number;
}

export function useClaimCase() {
  const cache = useCaseCache();
  return useMutation({
    mutationFn: (input: VersionedCase) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/cases/{case_id}/claim/", {
          params: {
            path: { case_id: input.caseId },
            header: {
              "Idempotency-Key": caseCommandKey("claim", input.caseId, input.expectedVersion),
            },
          },
          body: { expected_version: input.expectedVersion },
        }),
      ),
    onSuccess: cache.apply,
    onError: (_error, input) => cache.refetch(input.caseId),
    retry: false,
  });
}

export function useEscalateCase() {
  const cache = useCaseCache();
  return useMutation({
    mutationFn: (input: VersionedCase & { severity: CaseSeverity }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/cases/{case_id}/escalate/", {
          params: {
            path: { case_id: input.caseId },
            header: {
              "Idempotency-Key": caseCommandKey(
                `escalate:${input.severity}`,
                input.caseId,
                input.expectedVersion,
              ),
            },
          },
          body: { expected_version: input.expectedVersion, severity: input.severity },
        }),
      ),
    onSuccess: cache.apply,
    onError: (_error, input) => cache.refetch(input.caseId),
    retry: false,
  });
}

export function useResolveCase() {
  const cache = useCaseCache();
  return useMutation({
    mutationFn: (input: VersionedCase & { resolution: string; note: string }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/cases/{case_id}/resolve/", {
          params: {
            path: { case_id: input.caseId },
            header: {
              "Idempotency-Key": caseCommandKey("resolve", input.caseId, input.expectedVersion),
            },
          },
          body: {
            expected_version: input.expectedVersion,
            resolution: input.resolution,
            note: input.note,
          },
        }),
      ),
    onSuccess: cache.apply,
    onError: (_error, input) => cache.refetch(input.caseId),
    retry: false,
  });
}

/**
 * A note, or a record that something was sent to somebody.
 *
 * Never moves the case. Sending a message is not progress — that is the plan's rule, and a UI
 * that advanced the status on "note added" would quietly re-introduce exactly what it forbids.
 */
export function useAddCaseNote() {
  const cache = useCaseCache();
  return useMutation({
    mutationFn: (input: { caseId: string; body: string; isCommunication: boolean }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/cases/{case_id}/notes/", {
          params: { path: { case_id: input.caseId } },
          body: { body: input.body, is_communication: input.isCommunication },
        }),
      ),
    onSuccess: cache.apply,
    retry: false,
  });
}
