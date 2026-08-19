"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a screen currently owns the whole viewport.
 *
 * ## The problem
 *
 * The site header is a whole-app concern and belongs above every route — that is
 * why it lives in the root layout. But a handful of screens are not pages inside
 * an app; they are the app for as long as they are open. The phone booking flow
 * is the clear case: it has its own sticky header, its own scroll region and its
 * own docked action, and rendering the site nav above it gives the customer two
 * headers, two back affordances and a set of navigation links inviting them out
 * of a flow they are three taps into.
 *
 * ## Why a store rather than a route list
 *
 * A list of "focused paths" in the layout would be wrong twice. It would be a
 * second place that has to know which screens exist, going stale the first time
 * one moves; and it could not express the real rule, which is not about the
 * route at all. `/requests/{id}` renders a full-viewport screen for a workforce
 * request on a phone and an ordinary page for a project request on a desktop —
 * same path, opposite answers.
 *
 * So the screen declares it. `MobileScreen` registers while it is mounted and
 * releases when it unmounts, and the chrome reads the answer. Nothing has to
 * agree about routes because nothing is asked about routes.
 *
 * ## A count, not a boolean
 *
 * Two focused screens can briefly overlap during a route transition, while the
 * outgoing one is still mounted and the incoming one already is. A boolean would
 * have the first unmount clear the flag the second had just set, and the header
 * would flicker back for a frame in the middle of a flow.
 */

let depth = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Claims the viewport. Returns the release function — call it on unmount.
 *
 * Deliberately imperative rather than a hook, so the caller decides *when* it
 * runs. `MobileScreen` claims in a layout effect, which is what makes the header
 * disappear in the same commit the screen appears in rather than a paint later.
 */
export function claimViewport(): () => void {
  depth += 1;
  emit();
  let released = false;
  return () => {
    // Guarded: React can run an effect's cleanup more than once in development,
    // and a double release would drive the count negative and strand the header
    // hidden for the rest of the session.
    if (released) return;
    released = true;
    depth -= 1;
    emit();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => depth > 0;
// The server renders no screens, so nothing has claimed anything yet. Saying so
// explicitly is what keeps hydration identical rather than merely usually so.
const getServerSnapshot = () => false;

export function useIsViewportClaimed(): boolean {
  // `subscribe` is a module-level constant, so it is already stable across
  // renders and needs no memoisation — passing it straight through is what the
  // hook wants.
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
