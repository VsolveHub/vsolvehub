"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useIsViewportClaimed } from "@/lib/focus-mode";

import { BottomNav, SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { FixedBackButton } from "./fixed-back-button";
import { appChromeLayout, CUSTOMER_VIEWPORT_WIDTH_CLASS } from "./app-chrome-layout";

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
  const pathname = usePathname();
  const chromeLayout = appChromeLayout(pathname);
  const hideMobileChrome = chromeLayout.hideMobileChrome === true;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname]);

  // A focused screen supplies its own header, its own scroll region and its own
  // docked action. It gets the viewport untouched — no chrome, and no padding
  // reserved for chrome that is not there.
  //
  // The design gallery is the same case reached a different way: each page there
  // renders a whole artboard, app bar and tab bar included, so the real chrome
  // around it would draw a second header above the drawn one and a second tab
  // bar below it. It is a path check rather than a `claimViewport()` call
  // because those pages are server components with nothing to run the claim.
  if (claimed || pathname.startsWith("/design/")) {
    // `/book/*` flows use `MobileScreen`, which already carries a back control in
    // its own header. A second fixed button would stack on top of it.
    const showFixedBack =
      pathname.startsWith("/design/") ||
      (claimed && !pathname.startsWith("/book/"));

    return (
      <>
        {showFixedBack ? (
          <FixedBackButton
            href={pathname.startsWith("/design/") ? "/" : undefined}
            label={pathname.startsWith("/design/") ? "Back to home" : "Go back"}
            className="md:hidden"
          />
        ) : null}
        {children}
      </>
    );
  }

  return (
    <>
      {hideMobileChrome ? (
        <FixedBackButton
          href={chromeLayout.mobileBackHref}
          label={chromeLayout.mobileBackLabel}
          className="md:hidden"
        />
      ) : null}
      <div className={hideMobileChrome ? "hidden md:block" : undefined}>
        <SiteHeader />
      </div>
      {/* Clears the fixed tab bar (64px) plus safe-area-inset-bottom on mobile across pages. Above `md` the bar is gone and so is the padding. */}
      <div
        className={`${CUSTOMER_VIEWPORT_WIDTH_CLASS} ${
          hideMobileChrome
            ? "pt-14 md:pt-0 pb-0 md:pb-0"
            : "pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0"
        }`}
      >
        <div className={chromeLayout.contentMinHeightClass}>
          {children}
        </div>
        {chromeLayout.hideMobileFooter ? (
          <div className="hidden md:block">
            <SiteFooter />
          </div>
        ) : (
          <SiteFooter />
        )}
      </div>
      <div className={hideMobileChrome ? "hidden md:block" : undefined}>
        <BottomNav />
      </div>
    </>
  );
}
