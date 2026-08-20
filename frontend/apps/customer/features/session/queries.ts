"use client";

import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, useAuthGuard } from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

/**
 * "Is anyone signed in?", answered in a form a screen can act on.
 *
 * Three outcomes, kept apart on purpose. Collapsing them is how a customer with
 * a perfectly good session gets asked to log in again because the API was
 * briefly unreachable:
 *
 *   authenticated — Django returned a user
 *   anonymous     — Django returned `user: null`, a definite "nobody"
 *   unavailable   — anything else; we do not know, so nothing may be claimed
 *
 * As of contract 1.3.0 the anonymous case is a plain `200` with `user: null`, so
 * this no longer has to provoke a `401` to learn the answer. That matters beyond
 * tidiness: the old probe tripped the client's `onUnauthorized` hook and
 * broadcast a logout to sibling tabs every time an anonymous visitor opened the
 * booking page.
 *
 * `401` now means what it should — a session that was presented and is no longer
 * valid — which is why `isAnonymous` covers both and callers word the difference
 * from the stage they are on rather than from the status code.
 */

export interface CustomerSession {
  /** The answer is still in flight. Show neither a login prompt nor user data. */
  isResolving: boolean;
  isAuthenticated: boolean;
  /** Django says nobody is signed in. Safe to ask the customer to log in. */
  isAnonymous: boolean;
  /** The question could not be answered. Offer a retry, never a login wall. */
  isUnavailable: boolean;
  userId: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  fullName: string | null;
  email: string | null;
  dateJoined: string | null;
  /** Django's currently selected role, or null when signed out. */
  activeRole: string | null;
  refetch: () => void;
}

export function useCustomerSession(): CustomerSession {
  // The shared guard owns the 401/403/transport classification so the booking
  // workspace and the Partner shell cannot drift apart on what a 401 means.
  // This only narrows it to the outcomes the booking flow acts on.
  const guard = useAuthGuard(getApiClient());
  const queryClient = useQueryClient();

  return {
    isResolving: guard.status === "checking",
    isAuthenticated: guard.status === "authenticated",
    isAnonymous: guard.status === "unauthenticated",
    isUnavailable: guard.status === "error" || guard.status === "forbidden",
    userId: guard.user?.id ?? null,
    phoneNumber: guard.user?.phone_number ?? null,
    displayName: guard.user?.display_name?.trim() || null,
    fullName: guard.user?.full_name?.trim() || null,
    email: guard.user?.email?.trim() || null,
    dateJoined: guard.user?.date_joined ?? null,
    activeRole: guard.activeRole,
    refetch: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.session.current() }),
  };
}
