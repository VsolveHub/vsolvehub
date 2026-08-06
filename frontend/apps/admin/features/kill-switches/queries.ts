"use client";

import { request, type Schemas } from "@vsolve/api-client";
import { queryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * Kill switches (contract 1.17.0).
 *
 * Read as one board, never a switch at a time — during an incident the question is "what is off
 * right now", and a screen that answered it one row per request would be a screen nobody trusts.
 *
 * No step-up on either direction, matching the server: a control that is hard to reach when it
 * is needed is a control nobody uses. The reason is required because an outage nobody can
 * explain afterwards is worse than the outage itself.
 */

export type KillSwitch = Schemas["KillSwitch"];
export type KillSwitchScope = Schemas["KillSwitchScopeEnum"];

export function useKillSwitches() {
  return useQuery({
    queryKey: queryKeys.operations.killSwitches(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/operations/kill-switches/", {})),
    // Short stale time on purpose: this board is read during incidents, when a cached answer is
    // actively dangerous.
    staleTime: 5_000,
  });
}

function useInvalidateSwitches() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.operations.killSwitches() });
  };
}

export function useEngageKillSwitch() {
  const invalidate = useInvalidateSwitches();
  return useMutation({
    mutationFn: (input: { scope: KillSwitchScope; target: string; reason: string }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/kill-switches/", {
          body: { scope: input.scope, target: input.target, reason: input.reason },
        }),
      ),
    onSuccess: invalidate,
    retry: false,
  });
}

export function useReleaseKillSwitch() {
  const invalidate = useInvalidateSwitches();
  return useMutation({
    mutationFn: (input: { scope: KillSwitchScope; target: string }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/kill-switches/release/", {
          body: { scope: input.scope, target: input.target },
        }),
      ),
    onSuccess: invalidate,
    retry: false,
  });
}
