"use client";

import { safeNextPath, useAuthGuard, useOtpFlow } from "@vsolve/query";
import { ErrorState, Spinner } from "@vsolve/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { getApiClient } from "@/lib/api/browser";

import { CustomerLoginExperience } from "./customer-login-experience";

/**
 * The Customer login route.
 *
 * ## Why this exists when the booking workspace already logs people in
 *
 * They answer different questions. The workspace's login *interrupt* fires at
 * the address boundary, mid-scope, and is deliberately inline: Django will not
 * persist an anonymous address, but throwing the customer to a full page there
 * would cost them the scope they had just described. That interrupt stays.
 *
 * This route answers the other question — "I have an account and I want in" —
 * which had no answer at all. There was no `/login`, so an expired cookie on
 * `/bookings` had nowhere to send anyone, and nothing in the app could link to a
 * signed-in destination.
 *
 * ## Where it sends people
 *
 * A validated `?next=` wins, so a deep link survives an expired session. With
 * nothing to return to, `/bookings` — someone who signed in deliberately, rather
 * than being interrupted, came to look at their bookings.
 *
 * `safeNextPath` is the shared guard in `@vsolve/query`, not a local copy. An
 * open redirect here would hand a freshly authenticated customer to an
 * attacker's page carrying the credibility of having just signed in.
 */
export function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const guard = useAuthGuard(getApiClient());
  const flow = useOtpFlow(getApiClient());

  const isAuthenticated = guard.status === "authenticated";
  const next = safeNextPath(searchParams.get("next"));

  useEffect(() => {
    if (!isAuthenticated) return;
    router.replace(next ?? "/bookings");
  }, [isAuthenticated, next, router]);

  if (guard.status === "checking") {
    return (
      <main className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-16 text-text-secondary">
        <Spinner size="sm" />
        Checking your session…
      </main>
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

  // Already signed in, or signed in just now: the effect is navigating. Showing
  // the form again here is how someone ends up logging in twice.
  if (isAuthenticated) {
    return (
      <main className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-16 text-text-secondary">
        <Spinner size="sm" />
        Taking you to your bookings…
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl items-center px-4 py-6 sm:py-10">
      <CustomerLoginExperience
        flow={flow}
        variant="page"
        footer={
          <p>
            New here?{" "}
            <a
              href="/catalog"
              className="font-semibold text-info-text underline-offset-4 hover:underline"
            >
              Browse services
            </a>{" "}
            — you can add to your basket before signing in.
          </p>
        }
      />
    </main>
  );
}
