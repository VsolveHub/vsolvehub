"use client";

import { hasRole, useCurrentSession } from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

import { PARTNER_ROLE } from "./partner-shell";

/**
 * Whether this session holds the Partner role, and whether we know yet.
 *
 * ## Why anything needs to ask
 *
 * Half the registration surface is `IsAuthenticated` — capability options, the
 * business profile, the insurance declaration — and half is `IsPartnerUser`:
 * capabilities, gates, crew and the demand preview. Django grants the role when
 * an application is *created*, so on `/apply` there is a real, common window in
 * which a signed-in person holds none of it.
 *
 * A screen that asked anyway would spend a guaranteed `403` on every page view
 * by exactly the people that tree exists for, and would put a failed query in a
 * cache the session then inherits. `PartnerShell` already draws this
 * distinction for the workspace grants; this is the same decision, reusable.
 *
 * ## `isResolved` is not decoration
 *
 * `hasRole` on an unread session is `false`, which is indistinguishable from "we
 * asked and they do not have it". A caller that used the boolean alone would
 * disable a read forever if it mounted before the session landed, and the screen
 * behind it would sit on a loading state that never resolves — a disabled query
 * is `pending` for as long as the tab is open.
 *
 * This reads the same shared `useCurrentSession` query the shell does, so it
 * costs no extra request.
 */
export interface PartnerRoleState {
  /** True only once the session has been read and the grant is present. */
  readonly isPartner: boolean;
  /** False while the session read is still in flight. */
  readonly isResolved: boolean;
}

export function usePartnerRole(): PartnerRoleState {
  const session = useCurrentSession(getApiClient());

  return {
    isPartner: hasRole(session.data?.user, PARTNER_ROLE),
    isResolved: !session.isPending,
  };
}
