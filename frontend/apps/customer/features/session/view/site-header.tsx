"use client";

import { useLogout } from "@vsolve/query";
import { Button, Logo, cn } from "@vsolve/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" aria-label="V Solve Hub home" className="shrink-0">
          <Logo className="h-7 w-auto" />
        </Link>

        <nav aria-label="Main" className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2">
          {links.map((link) => {
            // `startsWith` so `/bookings/{id}/pay` still marks "My bookings" as
            // current. An exact match would leave the whole payment tree with no
            // indication of where the customer is.
            const isCurrent =
              pathname === link.href || pathname.startsWith(`${link.href}/`);

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "text-sm font-medium text-text-secondary hover:text-text",
                  isCurrent && "text-text underline underline-offset-8",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Resolving shows nothing rather than guessing. */}
        {session.isResolving ? null : session.isAuthenticated ? (
          <div className="flex items-center gap-3">
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
