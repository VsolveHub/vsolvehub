"use client";

import type { ReactNode } from "react";

import { useIsViewportClaimed } from "@/lib/focus-mode";

import { BottomNav, SiteHeader } from "./site-header";

/**
 * The app's navigation, except where a screen has taken the viewport.
 *
 * It keeps the *decision* out of the root layout, which is a server component
 * and cannot subscribe to anything, and out of the two chromes, neither of
 * which should know that a booking flow exists. See `lib/focus-mode` for why the
 * screens declare this rather than the layout matching on paths.
 *
 * ## Why this now wraps the page
 *
 * It used to render the header and nothing else, above `{children}` in the
 * layout. The phone navigation moved to the bottom of the viewport, where it is
 * `fixed` and therefore out of flow — so something has to reserve the space it
 * covers, and that something has to be the same thing that decides whether the
 * bar is there at all. A padding class on `<body>` would be wrong on exactly the
 * screens that hide the bar, and a spacer rendered beside the header would sit
 * at the top of the document instead of the bottom.
 *
 * So the chrome owns the page's frame: bar, spacing, and the decision to render
 * neither, in one place that cannot disagree with itself.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const claimed = useIsViewportClaimed();

  // A focused screen supplies its own header, its own scroll region and its own
  // docked action. It gets the viewport untouched — no chrome, and no padding
  // reserved for chrome that is not there.
  if (claimed) return <>{children}</>;

  return (
    <>
      <SiteHeader />
      {/* Clears the fixed tab bar (56px) plus whatever the device reserves for
          its home indicator. Above `md` the bar is gone and so is the padding. */}
      <div className="pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
      <BottomNav />
    </>
  );
}
