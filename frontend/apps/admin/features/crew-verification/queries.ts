"use client";

import { getStableIdempotencyKey, request, type Schemas } from "@vsolve/api-client";
import { SESSION_STATE } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

export type CrewVerificationQueue = Schemas["CrewVerificationQueue"];
export type CrewVerificationRow = Schemas["CrewMembershipVerificationRow"];
export type CrewDocumentList = Schemas["CrewDocumentReviewList"];
export type CrewDocumentRow = Schemas["CrewDocumentReviewRow"];
export type CrewGender = Schemas["CrewMembershipVerificationRow"]["gender"];

/** `PENDING` is the worklist; `VERIFIED` is how a reviewer reaches somebody to un-verify. */
export type QueueState = "PENDING" | "VERIFIED";

export const crewVerificationKeys = {
  all: ["operations", "crew-verification"] as const,
  queue: (state: QueueState) => [...crewVerificationKeys.all, "queue", state] as const,
  documents: (membershipId: string) =>
    [...crewVerificationKeys.all, "documents", membershipId] as const,
};

/**
 * Active crew memberships and where their document check stands.
 *
 * Two lists, not one, because they are two different jobs: clearing a backlog, and finding a
 * decision that turned out to be wrong. Keyed by state so switching tabs does not show the other
 * tab's rows while the fetch is in flight.
 */
export function useCrewVerificationQueue(state: QueueState) {
  return useQuery<CrewVerificationQueue>({
    queryKey: crewVerificationKeys.queue(state),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/crew-memberships/", {
          params: { query: { state } },
        }),
      ),
    ...SESSION_STATE,
    refetchInterval: 30_000,
    retry: false,
  });
}

/**
 * The documents behind one worker's verification, each with a signed link to the file.
 *
 * Never cached beyond the moment: `review_url` is short-lived and signed per read, so a stale
 * entry is a set of dead links. Fetched when a reviewer opens somebody, and dropped when they
 * close them.
 */
export function useCrewDocuments(membershipId: string | null) {
  return useQuery<CrewDocumentList>({
    queryKey: crewVerificationKeys.documents(membershipId ?? "none"),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/crew-memberships/{membership_id}/documents/", {
          params: { path: { membership_id: membershipId as string } },
        }),
      ),
    enabled: membershipId !== null,
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
}

export interface CrewDocumentDecision {
  readonly membershipId: string;
  readonly documentId: string;
  readonly approved: boolean;
  readonly reason: string;
}

/**
 * Approve or reject one document.
 *
 * The membership's verification is the server's consequence, not this mutation's: approving the
 * last required kind verifies it and rejecting a required kind withdraws it, both through the
 * same audited command. So both queues are invalidated on settle — the row may have moved between
 * them, and guessing which way from here would be a second copy of a rule that lives in Django.
 */
export function useReviewCrewDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CrewDocumentDecision) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/crew-documents/{document_id}/review/", {
          params: {
            path: { document_id: input.documentId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `operations-crew-document:${input.documentId}:${input.approved ? "approved" : "rejected"}`,
              ),
            },
          },
          body: { approved: input.approved, reason: input.reason },
        }),
      ),
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: crewVerificationKeys.all });
      void queryClient.invalidateQueries({
        queryKey: crewVerificationKeys.documents(input.membershipId),
      });
    },
    retry: false,
  });
}

export interface CrewVerificationDecision {
  readonly membershipId: string;
  readonly verified: boolean;
  /** Required by the server when withdrawing verification, and ignored when granting it. */
  readonly reason: string;
}

/**
 * Record — or withdraw — an Operations verification directly.
 *
 * This is the offline path and it is deliberately still here now that documents exist: a check
 * completed in person is a real thing that happened, and refusing to record it would push it into
 * a spreadsheet. Withdrawing needs a reason because it takes a named person off jobs they may
 * already be assigned to.
 */
export function useVerifyCrewDocuments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CrewVerificationDecision) =>
      request(() =>
        getApiClient().POST(
          "/api/v1/operations/crew-memberships/{membership_id}/verification/",
          {
            params: {
              path: { membership_id: input.membershipId },
              header: {
                "Idempotency-Key": getStableIdempotencyKey(
                  `operations-crew-documents:${input.membershipId}:${input.verified ? "verified" : "withdrawn"}`,
                ),
              },
            },
            body: { verified: input.verified, reason: input.reason },
          },
        ),
      ),
    // Refetched rather than spliced. A decision moves the row from one queue to the other, and
    // removing it locally would leave it missing from both until the next poll.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: crewVerificationKeys.all });
    },
    retry: false,
  });
}

export interface CrewGenderCorrection {
  readonly membershipId: string;
  readonly gender: Exclude<CrewGender, "">;
  readonly reason: string;
}

/**
 * Settle a disputed crew gender.
 *
 * The Partner-side rule is first-write-wins and a contradiction is refused — correct, and it had
 * no exit: the refusal told the Partner to contact support and support had no tool. This is that
 * tool. A reason is required and the previous value goes into the audit event, because this write
 * overwrites something another agency is already being dispatched against.
 */
export function useCorrectCrewGender() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CrewGenderCorrection) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/crew-memberships/{membership_id}/gender/", {
          params: {
            path: { membership_id: input.membershipId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                `operations-crew-gender:${input.membershipId}:${input.gender}`,
              ),
            },
          },
          body: { gender: input.gender, reason: input.reason },
        }),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: crewVerificationKeys.all });
    },
    retry: false,
  });
}
