"use client";

import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import { SESSION_STATE, queryKeys } from "@vsolve/query";
import { useQuery } from "@tanstack/react-query";

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
