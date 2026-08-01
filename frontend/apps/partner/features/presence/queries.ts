"use client";

import { request, type Schemas } from "@vsolve/api-client";
import { queryKeys } from "@vsolve/query";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * Going online, staying online, going offline.
 *
 * ## Presence is the server's answer, never the browser's claim
 *
 * A Partner is available when Django says a presence session exists and its
 * heartbeat is fresh — not when this tab thinks it is online. So nothing here
 * stores an optimistic "online" flag: the UI renders the server's session, and
 * a failed heartbeat means availability is in doubt and must be shown as such.
 * The alternative is a Partner who believes they are receiving offers while the
 * dispatcher has already passed them over.
 *
 * ## Why none of these retry
 *
 * `online` places the Partner in the dispatch pool at a location; `offline`
 * removes them. Silently resending either after a failure would either re-add
 * someone who has stopped work or repeatedly re-place them at a stale location.
 * The screen decides what to do about a failure, visibly.
 */

export type PartnerPresence = Schemas["PartnerPresence"];
export type GoOnlineInput = Schemas["PartnerGoOnlineRequest"];
export type HeartbeatInput = Schemas["PartnerPresenceHeartbeatRequest"];

export function useGoOnline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GoOnlineInput) =>
      request(() => getApiClient().POST("/api/v1/partner/presence/online/", { body: input })),
    onSuccess: () => {
      // Eligibility is part of the Partner's own record and the server may have
      // just changed its mind about it; nothing else is touched.
      void queryClient.invalidateQueries({ queryKey: queryKeys.partner.me() });
    },
    retry: false,
  });
}

export function useHeartbeat() {
  return useMutation({
    mutationFn: (input: HeartbeatInput) =>
      request(() =>
        getApiClient().POST("/api/v1/partner/presence/heartbeat/", { body: input }),
      ),
    retry: false,
  });
}

export function useGoOffline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Schemas["PartnerPresenceSessionRequestRequest"]) =>
      request(() => getApiClient().POST("/api/v1/partner/presence/offline/", { body: input })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.partner.me() });
    },
    retry: false,
  });
}
