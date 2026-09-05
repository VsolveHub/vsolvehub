"use client";

import { useSyncExternalStore } from "react";

/** Client-only state never changes after mount, so there is nothing to subscribe to. */
function subscribe() {
  return () => {};
}

/**
 * Whether React has hydrated on the client yet.
 *
 * ## Why this exists
 *
 * Some components must not render their real content on the server: a nav CTA
 * that depends on who is signed in, a login screen that redirects once it knows
 * where you belong. The server has no session, so it renders the logged-out
 * shell; if the client rendered the signed-in shell on its first pass the two
 * trees would disagree and React would throw away the markup.
 *
 * The guard is to render the same neutral fallback the server did until
 * hydration finishes, then re-render with the truth.
 *
 * ## Why `useSyncExternalStore` rather than an effect
 *
 * The obvious version is `useState(false)` plus `useEffect(() => setHydrated(true), [])`.
 * It works, but it schedules a state update during the commit that just
 * finished, which is the cascading render the `react-hooks/set-state-in-effect`
 * lint rule exists to prevent.
 *
 * `useSyncExternalStore` says the same thing declaratively. It takes an explicit
 * **server snapshot** — `false`, the honest answer for a server that has not
 * hydrated anything — and a client snapshot of `true`. React returns the server
 * value for SSR and the first client render, so hydration always matches, then
 * settles to `true`. Same two-phase behaviour, no effect, and it matches how
 * `useMediaQuery` already handles server-unknowable state in this package.
 *
 * A component using this renders its fallback for one frame, so the fallback
 * should be the neutral/logged-out state rather than a spinner wherever that
 * reads better.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
