"use client";

import { useIsViewportClaimed } from "@/lib/focus-mode";

import { SiteHeader } from "./site-header";

/**
 * The app's navigation, except where a screen has taken the viewport.
 *
 * A one-line component with a real job: it keeps the *decision* out of the root
 * layout, which is a server component and cannot subscribe to anything, and out
 * of `SiteHeader`, which should not know that a booking flow exists.
 *
 * See `lib/focus-mode` for why the screens declare this rather than the layout
 * matching on paths.
 */
export function AppChrome() {
  return useIsViewportClaimed() ? null : <SiteHeader />;
}
