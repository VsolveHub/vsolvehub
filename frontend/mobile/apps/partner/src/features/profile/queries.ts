// Ported from frontend/apps/partner/features/profile/queries.ts

import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import { SESSION_STATE, queryKeys } from "@vsolve/query/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@vsolve/mobile-core";

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

/** `404` is a real answer: an applicant with no profile yet has none to show. */
export function isNoProfileYet(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

export function usePartnerProfile() {
  return useQuery({
    queryKey: queryKeys.partner.me(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/me/")),
    ...SESSION_STATE,
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && error.status === 404 ? false : failureCount < 2,
  });
}

/**
 * Changes the name Customers see.
 *
 * `display_name` only. The phone number is the login credential — moving it
 * moves who can sign in — so it belongs behind an OTP challenge on the new
 * number rather than behind a field on this form. Django refuses it here.
 *
 * No optimistic write: the response is the authoritative profile, and a name
 * that appeared before the server accepted it would be a claim this client
 * cannot make.
 */
export function useUpdatePartnerProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (displayName: string) =>
      request(() =>
        getApiClient().PATCH("/api/v1/partner/me/", {
          body: { display_name: displayName },
        }),
      ),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.partner.me(), profile);
    },
    retry: false,
  });
}
