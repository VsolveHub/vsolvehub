"use client";

import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import { SESSION_STATE, queryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The Partner's own standing profile.
 *
 * Separate from `features/application` on purpose. An application is a
 * submission with a review lifecycle; a profile is the record of a person who
 * works here. `GET /partner/me/` used to return the application byte-for-byte,
 * which is why the Account tab opened a half-finished onboarding form.
 *
 * No `partner_id` anywhere: the endpoint resolves the Partner from the session,
 * so there is no identifier this layer can get wrong.
 */

export type PartnerProfile = Schemas["PartnerProfile"];
export type PartnerProfileUpdate = Schemas["PatchedPartnerProfileUpdateRequest"];

/** `404` is a real answer: an applicant with no profile yet has none to show. */
export function isNoProfileYet(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

/**
 * `enabled` is for the marketing chrome, which renders for visitors and
 * applicants alike: Django answers `403` to anyone without the `partner` role,
 * and every one of those refusals is a red line in the console.
 */
export function usePartnerProfile({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    enabled,
    queryKey: queryKeys.partner.me(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/me/")),
    ...SESSION_STATE,
    // 401, 403 and 404 are answers about who is asking. Asking again gets the
    // same answer, so only transport and server failures are retried.
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && [401, 403, 404].includes(error.status)
        ? false
        : failureCount < 2,
  });
}

/**
 * Changes what a Partner may change about themselves.
 *
 * Accepts `default_location_text`. The name is fixed once the application is
 * sent (Operations checked it against the Partner's ID), and the phone number is
 * the login credential — moving it moves who can sign in.
 *
 * No optimistic write: the response is the authoritative profile.
 */
export function useUpdatePartnerProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: PartnerProfileUpdate) =>
      request(() =>
        getApiClient().PATCH("/api/v1/partner/me/", {
          body: patch,
        }),
      ),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.partner.me(), profile);
    },
    retry: false,
  });
}


export type PrivacyRequest = Schemas["PrivacyRequest"];

/** The account's own privacy requests, newest first. Same endpoint the customer app uses. */
export function usePrivacyRequests({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    enabled,
    queryKey: queryKeys.privacy.requests(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/auth/privacy/requests/")),
    ...SESSION_STATE,
  });
}

/**
 * Asks for the account and its data to be deleted. Operations completes it: records the law
 * requires us to keep stay until they expire.
 */
export function useRequestAccountDeletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      request(() =>
        getApiClient().POST("/api/v1/auth/privacy/requests/", { body: { kind: "ERASURE" } }),
      ),
    onSuccess: (created) => {
      queryClient.setQueryData<PrivacyRequest[]>(queryKeys.privacy.requests(), (current = []) => [
        created,
        ...current.filter((item) => item.id !== created.id),
      ]);
    },
    retry: false,
  });
}

/** Still being worked on, so the same request cannot be filed again yet. */
export function isPrivacyRequestOpen(privacyRequest: PrivacyRequest): boolean {
  return privacyRequest.status === "RECEIVED" || privacyRequest.status === "IN_REVIEW";
}
