"use client";

import { useLogout } from "@vsolve/query";
import { Button, Logo, cn } from "@vsolve/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { NotificationBell } from "@/features/notifications/view/notification-bell";
import { getApiClient } from "@/lib/api/browser";

import { useCustomerSession } from "../queries";
import { ProfileMark, profileName } from "./profile-mark";

/**
 * The Customer app's top bar.
 *
 * ## What changed, and why the hamburger is gone
 *
 * This header used to carry seven links and collapse them into a hamburger
 * below `md`, because seven links wrap to three rows on a phone. The seven are
 * now three (`NAV_TARGETS` below), and on a phone they live in a tab bar at the
 * bottom of the viewport where a thumb can reach them — so the hamburger has
 * nothing left to hide and is deleted rather than kept as a second way to reach
 * the same three places. The profile avatar owns personal settings.
 *
 * On a phone this bar is therefore identity and alerts only: who you are signed
 * in as, and whether anything has happened. Where you can go is the bar below.
 *
 * ## Why the session states are not collapsed
 *
 * `isResolving` renders neither "Log in" nor an account link. Showing "Log in"
 * while the answer is in flight makes a signed-in customer's own header tell
 * them they are signed out on every cold load, and the flicker back is worse
 * than the wait. `isUnavailable` is treated as signed-out for *navigation* only:
 * the links still work, Django still refuses what it should, and nobody is shown
 * a login wall because a request failed.
 */
export function SiteHeader() {
  const session = useCustomerSession();
  const logout = useLogout(getApiClient());
  const pathname = usePathname();
  const router = useRouter();

  const targets = NAV_TARGETS.filter(
    (target) => !target.private || session.isAuthenticated,
  );

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface">
      <div className="mx-auto flex min-h-16 w-full max-w-[1216px] items-center gap-x-7 px-4 py-3 sm:px-6 lg:px-0">
        <Link href="/" aria-label="V Solve Hub home" className="shrink-0">
          <Logo className="h-7 w-auto" />
        </Link>

        {/* Below `md` the tab bar owns navigation, so this is deliberately
            absent rather than collapsed behind a control. */}
        <nav aria-label="Main" className="hidden flex-1 items-center gap-x-1 md:flex">
          {targets.map((target) => {
            const current = isCurrentTarget(target.href, pathname);
            return (
              <Link
                key={target.href}
                href={target.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center whitespace-nowrap rounded-control px-3.5 text-sm",
                  "transition-colors duration-fast",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  current
                    ? // A tinted plate rather than an underline: it survives
                      // greyscale, and it matches the phone bar's own cue so the
                      // two chromes read as one app.
                      "bg-action-surface font-extrabold text-text"
                    : "font-semibold text-text-secondary hover:bg-surface-hover hover:text-text",
                )}
              >
                {target.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 md:hidden" />

        {/* Resolving shows nothing rather than guessing. */}
        {session.isResolving ? null : session.isAuthenticated ? (
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Inside the authenticated cluster and nowhere else. The bell polls
                an `IsAuthenticated` endpoint, so mounting it for a visitor would
                start a minute-long poll against a refusal — and mounting it
                while the session is still resolving would do the same on every
                cold load, which is the same flicker this branch exists to
                avoid. Its being rendered *is* the session gate; the component
                itself asks no question about who is signed in. */}
            <NotificationBell />
            <Link
              href="/account"
              aria-label="Open profile"
              title={profileName(session) ?? "Profile"}
              className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <ProfileMark identity={session} className="size-10 text-xs" />
            </Link>
            {/* Sign out is a desktop affordance. On a phone it lives on the
                profile screen reached through the avatar. */}
            <Button
              variant="ghost"
              className="hidden md:inline-flex"
              onClick={() =>
                logout.mutate(undefined, {
                  onSuccess: () => {
                    router.replace("/login");
                    router.refresh();
                  },
                })
              }
              loading={logout.isPending}
              loadingLabel="Signing out"
            >
              Sign out
            </Button>
          </div>
        ) : (
          <Link
            href="/login"
            className="text-sm font-semibold text-text-link hover:underline"
          >
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}


/**
 * The Customer app's navigation, in one list.
 *
 * ## Why there are three
 *
 * There were seven: Services, Basket, My bookings, My requests, My projects,
 * Account, and a sign-out control — plus `/bookings/workforce` reachable only
 * from a sentence at the bottom of the bookings page. Three of those seven were
 * the same question filed three ways. A Customer who wanted "the job I am
 * waiting on" had to know whether it was a booking, a request or a project,
 * which is our word for it and not theirs.
 *
 * So the three collapse into `Activity`, which segments them internally. The
 * segments stay, because the distinction between them is real — an A3 booking
 * and an A5 project make different promises about who holds the money, and
 * `engagement-list-screen.tsx` is explicit that one noun over both would
 * misstate that. What goes away is being asked to make that distinction before
 * you have found the thing.
 *
 * ## Why the whole navigation is one file
 *
 * Two chromes render this list — the desktop bar above and the phone tab bar
 * below — and they must not be able to disagree about what the app contains.
 * They were briefly three modules plus a glyph set; that is four files for one
 * question, and four places for the answer to drift. The list, the current-item
 * rule, the icons and both bars live together because they are one concern.
 */

export interface NavTarget {
  href: string;
  /** What the desktop bar shows. */
  label: string;
  /**
   * What the phone tab bar shows under the icon. Shorter where the full label
   * would wrap in a quarter of a 390px viewport.
   */
  shortLabel: string;
  /** One of the drawn glyphs in `NavIcon` below. */
  icon: "home" | "activity" | "basket";
  /**
   * Requires a session. An anonymous visitor is never shown a link that bounces
   * them to login — the tab bar substitutes a Log in target instead.
   */
  private: boolean;
}

export const NAV_TARGETS: readonly NavTarget[] = [
  // Deliberately first and deliberately public: the catalog and the anonymous
  // basket are real surfaces for somebody who has never signed in.
  { href: "/catalog", label: "Services", shortLabel: "Services", icon: "home", private: false },
  { href: "/activity", label: "Activity", shortLabel: "Activity", icon: "activity", private: true },
  { href: "/cart", label: "Basket", shortLabel: "Basket", icon: "basket", private: false },
];

/**
 * The paths each target owns, beyond its own href.
 *
 * `startsWith` on the href alone would leave the whole `/requests/{id}` tree
 * with no indication of where the reader is, because those routes did not move
 * when the nav item did. Activity is the front door for three record types and
 * every screen under them, so it claims their trees explicitly.
 */
const OWNED: Record<string, readonly string[]> = {
  "/activity": ["/activity", "/bookings", "/requests", "/projects", "/engagements"],
};

/**
 * Whether `pathname` is inside `href`'s territory.
 *
 * Exported and pure so the two chromes cannot drift, and so the rule is
 * testable without rendering a header.
 */
export function isCurrentTarget(href: string, pathname: string): boolean {
  const owned = OWNED[href] ?? [href];
  return owned.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

/**
 * The three navigation glyphs, drawn.
 *
 * Stroke-based on a 24px grid at 1.9 units, which is the weight the rest of the
 * app's inline icons use. Drawn rather than emoji or an icon font for the reason
 * this product runs on mid-range Android in daylight: a glyph we control scales,
 * recolours with `currentColor`, and costs no network request that can fail and
 * leave a row of empty boxes where the navigation was.
 *
 * Every one is `aria-hidden`. The label under it carries the meaning, and a
 * screen reader announcing "house" before "Services" is noise.
 */
export function NavIcon({ name, className }: { name: NavTarget["icon"]; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}

const PATHS: Record<NavTarget["icon"], React.ReactNode> = {
  // A roof over a structure — the logo's own motif, reduced to two strokes.
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
    </>
  ),
  // Two stacked bands: a list of things, not a chart. Deliberately not a bell
  // or a clock — neither of those is what Activity holds.
  activity: (
    <>
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
    </>
  ),
  basket: (
    <>
      <path d="M4 8h16l-1.4 11.2a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
};

/**
 * The phone navigation: a tab bar at the bottom of the viewport.
 *
 * ## Why the bottom
 *
 * The old phone navigation was a hamburger in the top-left — the furthest point
 * on the screen from a thumb holding the device, behind a tap, and announcing
 * nothing about where the reader currently is. Every destination in this app
 * cost two taps and a guess. Four targets sitting where the thumb already rests
 * cost one tap and no guess, and the current one is legible without opening
 * anything.
 *
 * ## Why an anonymous visitor sees three
 *
 * One of the three needs a session. The header's existing rule — never show a
 * link that bounces to login — is the right one and it survives here, so an
 * anonymous visitor gets Services, Basket and a Log in target. Three tabs is a
 * legitimate tab bar; a tab that throws you to a login wall is not.
 *
 * ## Why nothing renders while the session resolves
 *
 * Same reason the header does it: guessing "signed out" for the half second
 * before Django answers means a signed-in Customer watches their own navigation
 * change shape on every cold load. The bar reserves its space (the layout
 * padding is unconditional) and fills in.
 */
export function BottomNav() {
  const session = useCustomerSession();
  const pathname = usePathname();

  const targets = NAV_TARGETS.filter(
    (target) => !target.private || session.isAuthenticated,
  );

  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 md:hidden",
        "border-t border-line bg-surface",
        // The home indicator on a modern phone sits over the bottom ~20px. The
        // viewport meta is `viewport-fit=cover`, so this is the inset that keeps
        // the labels off it.
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <div className="flex items-stretch px-1">
        {targets.map((target) => {
          const current = isCurrentTarget(target.href, pathname);
          return (
            <Link
              key={target.href}
              href={target.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 pt-2",
                "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
                current ? "text-text" : "text-text-muted",
              )}
            >
              {/* The pill is the current-state cue that survives greyscale and
                  colour blindness — the weight change alone would not. */}
              <span
                className={cn(
                  "flex h-7 w-13 items-center justify-center rounded-full transition-colors duration-fast",
                  current ? "bg-action-surface" : null,
                )}
              >
                <NavIcon name={target.icon} className="size-[1.375rem]" />
              </span>
              <span
                className={cn(
                  "text-[0.65625rem] leading-none",
                  current ? "font-extrabold" : "font-semibold",
                )}
              >
                {target.shortLabel}
              </span>
            </Link>
          );
        })}

        {session.isResolving || session.isAuthenticated ? null : (
          <Link
            href="/login"
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 pt-2 text-text-link",
              "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
            )}
          >
            <span className="flex h-7 w-13 items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-[1.375rem]"
              >
                <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
                <path d="M10 16l4-4-4-4M14 12H3.5" />
              </svg>
            </span>
            <span className="text-[0.65625rem] font-semibold leading-none">Log in</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
