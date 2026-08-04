"use client";

import { useAuthGuard } from "@vsolve/query";
import { ErrorState, Spinner } from "@vsolve/ui";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { getApiClient } from "@/lib/api/browser";

/**
 * The gate for Customer screens that require a session.
 *
 * ## What it deliberately does not wrap
 *
 * The catalog, `/book/[service]` and **`/cart`**. The anonymous cart is a product
 * decision, not an oversight: a visitor builds a basket, and Django holds it
 * against the session cookie until a login merges it. Putting an auth gate in
 * front of `/cart` would turn browsing into a signup wall and delete the merge
 * flow's entire reason for existing.
 *
 * So this wraps `/bookings/**` — the tree where every read is one customer's own
 * record — and nothing else.
 *
 * ## Why there is no role requirement
 *
 * Django guards these endpoints with `IsAuthenticated`, not with a customer role.
 * Demanding `customer` here would refuse anyone whose session has another role
 * selected — and Django picks the alphabetically first grant at login, so a
 * person who is both a Customer and a Partner would be locked out of their own
 * bookings by a rule the server does not have. The shell asks for exactly what
 * the API asks for.
 */

function ShellMessage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-16 text-text-secondary">
      {children}
    </main>
  );
}

export function CustomerShell({ children }: { children: ReactNode }) {
  const guard = useAuthGuard(getApiClient());
  const pathname = usePathname();
  const router = useRouter();

  const isUnauthenticated = guard.status === "unauthenticated";

  /**
   * Sending someone to login is a navigation, not a screen.
   *
   * Carrying the current path as `next` is what makes a deep link survive an
   * expired cookie — the notification link to a specific booking still lands on
   * that booking after signing in, rather than dumping the customer on a list.
   */
  useEffect(() => {
    if (!isUnauthenticated) return;
    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isUnauthenticated, pathname, router]);

  if (guard.status === "checking") {
    return (
      <ShellMessage>
        <Spinner size="sm" />
        Checking your session…
      </ShellMessage>
    );
  }

  if (isUnauthenticated) {
    return (
      <ShellMessage>
        <Spinner size="sm" />
        Taking you to sign in…
      </ShellMessage>
    );
  }

  if (guard.status === "error") {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16">
        <ErrorState
          title="We could not check your session"
          message="Nothing has changed. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => window.location.reload()}
        />
      </main>
    );
  }

  return <>{children}</>;
}
