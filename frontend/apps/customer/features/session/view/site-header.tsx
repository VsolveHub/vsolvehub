"use client";

import { useLogout } from "@vsolve/query";
import { Button, Logo, cn } from "@vsolve/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { NotificationBell } from "@/features/notifications/view/notification-bell";
import { getApiClient } from "@/lib/api/browser";

import { useCustomerSession } from "../queries";

/**
 * The Customer app's one navigation.
 *
 * ## The defect this closes
 *
 * Nothing in this app linked to `/bookings`. The list, the detail view, the
 * bounded polling, the cursor pagination and the recovery actions were all
 * built, shipped and reachable only by typing the URL. The cart had the same
 * problem in reverse — you could get *into* it from a service page, but there
 * was no way back to it from anywhere else.
 *
 * A header is the cheapest possible fix for the largest amount of already-built
 * product, which is why it comes before any new feature work.
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

interface NavLink {
  href: string;
  label: string;
  /** Requires a session. Anonymous visitors are not shown a link that bounces. */
  private?: boolean;
}

const LINKS: readonly NavLink[] = [
  { href: "/catalog", label: "Services" },
  // Deliberately public: the anonymous cart is a real surface, and hiding it
  // from a visitor who has already added something to it would be absurd.
  { href: "/cart", label: "Basket" },
  { href: "/bookings", label: "My bookings", private: true },
  // The M2 surfaces, added at the Wave A3 gate for exactly the reason this
  // file's own note gives about `/bookings`: three waves of requirement,
  // quote, visit and engagement screens were reachable only by typing a URL.
  // `/bookings/workforce` is deliberately *not* a fifth tab — it lives under
  // `My bookings`, which `startsWith` already marks as current for it, and is
  // linked from that page.
  { href: "/requests", label: "My requests", private: true },
  { href: "/projects", label: "My projects", private: true },
  // Private for the same reason as bookings: every screen behind it is
  // `IsAuthenticated`, so showing it to a visitor is offering a link that
  // bounces straight to login.
  { href: "/account", label: "Account", private: true },
];

export function SiteHeader() {
  const session = useCustomerSession();
  const logout = useLogout(getApiClient());
  const pathname = usePathname();

  const links = LINKS.filter((link) => !link.private || session.isAuthenticated);

  function isCurrent(href: string): boolean {
    // `startsWith` so `/bookings/{id}/pay` still marks "My bookings" as current.
    // An exact match would leave the whole payment tree with no indication of
    // where the customer is.
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    // `relative`, because the narrow menu opens as a panel hanging under the bar
    // rather than pushing the page down. A nav that reflows the whole document
    // on open moves whatever the customer was about to tap.
    <header className="relative border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-x-6 px-4 py-3">
        {/* The hamburger leads on a phone, where it is the one navigation
            affordance; above `md` it is gone and the links speak for
            themselves. */}
        <MobileMenu links={links} isCurrent={isCurrent} />

        <Link href="/" aria-label="V Solve Hub home" className="shrink-0">
          <Logo className="h-7 w-auto" />
        </Link>

        {/* Seven links in a wrapping row is three stacked rows on a phone, which
            is a third of a small viewport spent on navigation before any screen
            has said anything. Above `md` they are a row; below it they collapse
            into the hamburger above. */}
        <nav aria-label="Main" className="hidden flex-1 items-center gap-x-5 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent(link.href) ? "page" : undefined}
              className={cn(
                "whitespace-nowrap text-sm font-medium text-text-secondary hover:text-text",
                isCurrent(link.href) && "text-text underline underline-offset-8",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1 md:hidden" />

        {/* Resolving shows nothing rather than guessing. */}
        {session.isResolving ? null : session.isAuthenticated ? (
          <div className="flex items-center gap-3">
            {/* Inside the authenticated cluster and nowhere else. The bell polls
                an `IsAuthenticated` endpoint, so mounting it for a visitor would
                start a minute-long poll against a refusal — and mounting it
                while the session is still resolving would do the same on every
                cold load, which is the same flicker this branch exists to
                avoid. Its being rendered *is* the session gate; the component
                itself asks no question about who is signed in. */}
            <NotificationBell />
            {session.phoneNumber !== null ? (
              <span className="hidden text-sm text-text-secondary sm:inline">
                {session.phoneNumber}
              </span>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => logout.mutate()}
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
 * The narrow-viewport navigation: a hamburger and a panel under the bar.
 *
 * A native `<details>` rather than a hand-rolled menu. It toggles on Enter and
 * Space, announces its own expanded state, and browser find-in-page opens it to
 * reveal a match — four behaviours every hand-rolled version has to re-earn and
 * most earn two of.
 *
 * The panel is absolutely positioned so opening it does not push the page down.
 * A nav that reflows the document on open moves whatever the customer was about
 * to tap, which on a phone is how somebody opens the wrong screen.
 *
 * ## Why `open` is held in state rather than left to the browser
 *
 * A `<details>` left uncontrolled only ever closes when its own summary is
 * clicked. Every link in here is a client-side navigation: the document is
 * never reloaded, so choosing a destination left the panel sitting open over
 * the screen it had just navigated to, and the customer had to go back and tap
 * the cross to dismiss the menu they had already finished with.
 *
 * So the element is controlled, and what is stored is not a boolean but *the
 * path the menu was opened on*. Open is then derived: the panel is open only
 * while the customer is still on the screen they opened it from. Any navigation
 * — a link in here, a link elsewhere, back, forward — changes `pathname` and
 * closes it without anything having to notice that it happened.
 *
 * `onClick` still clears it explicitly, because tapping the link for the screen
 * you are already on is a choice that leaves `pathname` untouched. `onToggle`
 * keeps the stored path honest when the browser opens or closes the element
 * itself: summary clicks, keyboard, find-in-page.
 */
function MobileMenu({
  links,
  isCurrent,
}: {
  links: readonly NavLink[];
  isCurrent: (href: string) => boolean;
}) {
  const pathname = usePathname();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;

  return (
    <details
      className="group md:hidden"
      open={open}
      onToggle={(event) => setOpenedOn(event.currentTarget.open ? pathname : null)}
    >
      <summary
        className={cn(
          "-ml-2 flex h-11 w-11 cursor-pointer list-none items-center justify-center",
          "rounded-control text-text-secondary hover:bg-surface-hover hover:text-text",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        )}
      >
        {/* The glyph is recognisable but it is not a label: a screen reader
            announcing "disclosure triangle" says nothing about where it leads.
            `<details>` supplies the expanded state on its own. */}
        <span className="sr-only">Menu</span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          className="h-5 w-5 shrink-0"
        >
          {/* Three bars closed, a cross open. Same control, and the open state is
              legible without reading anything. */}
          <path d="M3 6h14M3 10h14M3 14h14" className="group-open:hidden" />
          <path d="M5 5l10 10M15 5L5 15" className="hidden group-open:block" />
        </svg>
      </summary>

      <nav
        aria-label="Main"
        className="absolute inset-x-0 top-full z-30 flex flex-col gap-0.5 border-b border-line bg-surface p-2 shadow-raised"
      >
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setOpenedOn(null)}
            aria-current={isCurrent(link.href) ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-control px-3 text-sm font-medium",
              isCurrent(link.href)
                ? "bg-selected-surface text-text"
                : "text-text-secondary hover:bg-surface-hover hover:text-text",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </details>
  );
}
