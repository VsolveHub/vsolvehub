"use client";

import { ApiRequestError, request } from "@vsolve/api-client";
import { M2_FRESHNESS, m2QueryKeys, parseWorkspaceGrants, type WorkspaceGrant } from "@vsolve/query";
import { useQuery } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

import { resolveWorkspaces, specialtyShellHome } from "./registry";

/**
 * The read behind every M2 navigation decision: what is this Partner approved for.
 *
 * Closes the server half of `M2-FE-110`. `GET /api/v1/partner/workspaces/` is
 * published at contract 1.21.0; until it was, the shell took the grants as a
 * prop that nobody passed, which is why this file did not exist.
 *
 * ## Why an unread answer is `null` and not `[]`
 *
 * They render identically in the tab bar and mean opposite things everywhere
 * else. `[]` is a server answer — "you are approved for nothing", which is the
 * ordinary state of a Partner who registered this morning. `null` is the absence
 * of an answer, and `session-guard.ts` turns it into `UNVERIFIED`, which refuses
 * every command until the read succeeds.
 *
 * Collapsing the two would fail *open* in the one case that matters: a dropped
 * connection would read as "approved for nothing", which looks like a suspension
 * to the Partner and, worse, would let a screen conclude the workspace was
 * withdrawn and offer recovery for something that never happened.
 *
 * ## Why 403 does not retry
 *
 * Django answers 403 when the session does not hold the Partner role at all —
 * an applicant part-way through onboarding, most often. Retrying that walks into
 * the same refusal twice and delays the honest screen. It stays `null` rather
 * than becoming `[]` for the reason above: the app has not been told anything
 * about capabilities, only that it may not ask.
 *
 * ## Freshness
 *
 * `SESSION_STATE` via `M2_FRESHNESS.workspaceGrants`, so a suspension applied by
 * Operations lands on the next window focus rather than at the next login. That
 * is the whole mechanism `M2-FE-113` is written against: the grants change
 * underneath a Partner who is already inside the workspace, and the guard reacts
 * to the new shape.
 */

export interface WorkspaceGrantsRead {
  /**
   * The authorized workspaces, or `null` while the answer is not established —
   * loading, failed, or never asked for.
   */
  readonly grants: readonly WorkspaceGrant[] | null;
  readonly isPending: boolean;
  readonly isError: boolean;
  /** Offered where a refetch could plausibly help — see `recoveryFor`. */
  readonly refetch: () => void;
}

export interface WorkspaceGrantsOptions {
  /**
   * Ask only where Django will answer.
   *
   * The shell holds the session projection already, so it knows whether the
   * Partner role is held before the first request. Calling anyway would spend a
   * guaranteed 403 on every visit to `/apply`, where the whole point is that the
   * person is not a Partner yet.
   */
  readonly enabled?: boolean;
}

export function usePartnerWorkspaceGrants(
  options: WorkspaceGrantsOptions = {},
): WorkspaceGrantsRead {
  const enabled = options.enabled ?? true;

  const query = useQuery({
    queryKey: m2QueryKeys.workspace.grants(),
    queryFn: async () =>
      parseWorkspaceGrants(
        await request(() => getApiClient().GET("/api/v1/partner/workspaces/")),
      ),
    enabled,
    ...M2_FRESHNESS.workspaceGrants,
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && (error.status === 401 || error.status === 403)
        ? false
        : failureCount < 2,
  });

  return {
    // `isSuccess` rather than `data !== undefined`, which is the stricter of the
    // two: a refetch that fails leaves the last good answer in `data` while the
    // status goes to error, and reading it would keep authorizing against a
    // grant list the server has stopped confirming. `UNVERIFIED` and its
    // "actions stay switched off until we can confirm your access" is the
    // designed response to exactly that, and it costs a Partner one retry rather
    // than a command sent under a stale authorization.
    grants: query.isSuccess ? query.data : null,
    isPending: enabled && query.isPending,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

/**
 * The single specialty this Partner works in (rentals, stays or listings), or
 * null for an on-demand Partner or one with several workspaces.
 *
 * A specialty Partner never receives live job offers, so screens use this to
 * leave out "go online". `isPending` is true until the grants are read, so a
 * caller can hold back the toggle instead of flashing it.
 */
export function useSpecialtyHome(): { home: ReturnType<typeof specialtyShellHome>; isPending: boolean } {
  const grants = usePartnerWorkspaceGrants();
  return {
    home: specialtyShellHome(resolveWorkspaces(grants.grants ?? [])),
    isPending: grants.isPending,
  };
}
