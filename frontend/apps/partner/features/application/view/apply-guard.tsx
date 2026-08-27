"use client";

import { useAuthGuard } from "@vsolve/query";
import { ErrorState, Spinner } from "@vsolve/ui";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { getApiClient } from "@/lib/api/browser";

/**
 * The session gate for onboarding, without the signed-in app's chrome.
 *
 * ## Why `/apply` does not use `PartnerShell`
 *
 * `PartnerShell` renders the four-destination tab bar — Home, Work, Money, Me —
 * on every route it wraps, `/apply` included. All four point at screens an
 * applicant cannot use: they have no work, no earnings and no duty control, and
 * three of the four refuse them at the API. So somebody halfway through
 * onboarding was given a persistent navigation bar whose every destination was
 * a dead end, plus a Sign Out button in the header, and *no* indication of how
 * far through the application they were.
 *
 * Onboarding is a linear flow, not a tabbed app. It needs the opposite chrome:
 * where you are in the sequence, a way back one step, and a way out. That is
 * what `ApplyShell` draws, and it can only draw it if nothing else owns the top
 * and bottom of the screen.
 *
 * ## This is not a second copy of the session decision
 *
 * `PartnerShell`'s own docblock warns — correctly — that onboarding, offers and
 * availability each having their own login form is how one expired cookie
 * produced three different lock-out messages. That warning is about three
 * copies of the *decision*, and this is not one: it calls the same
 * `useAuthGuard` hook against the same client and sends an unauthenticated
 * visitor to the same `/login?next=` that `PartnerShell` does. What differs is
 * only what gets drawn around the children.
 *
 * ## No role requirement, deliberately
 *
 * Django grants the `partner` role when an application is *created*, and
 * `PATCH /api/v1/partner/application/` is `IsAuthenticated` and nothing more.
 * Requiring the role here would refuse every person who has not applied yet —
 * precisely the people this tree exists for. Same call `PartnerShell` makes for
 * this route, for the same reason.
 */
export function ApplyGuard({ children }: { children: ReactNode }) {
  const guard = useAuthGuard(getApiClient());
  const pathname = usePathname();
  const router = useRouter();

  const isUnauthenticated = guard.status === "unauthenticated";

  useEffect(() => {
    if (!isUnauthenticated) return;
    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isUnauthenticated, pathname, router]);

  if (guard.status === "checking") return <Waiting>Checking your access…</Waiting>;
  if (isUnauthenticated) return <Waiting>Taking you to sign in…</Waiting>;
  if (guard.isSelectingRole) return <Waiting>Opening your account…</Waiting>;

  if (guard.status === "error") {
    return (
      <Centred>
        <ErrorState
          title="We could not check your access"
          message="Nothing has changed. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => window.location.reload()}
        />
      </Centred>
    );
  }

  /*
    `forbidden` is unreachable here — nothing is required beyond a session — but
    it is a real member of the union, and falling through to render onboarding
    for it would be the one branch that shows an applicant a form they are not
    allowed to submit. Treated as the refusal it is.
  */
  if (guard.status === "forbidden") {
    return (
      <Centred>
        <ErrorState
          title="You cannot apply from this account"
          message="Sign in with the mobile number you want your Partner account to use."
        />
      </Centred>
    );
  }

  return <>{children}</>;
}

function Centred({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-5 py-10">
      {children}
    </main>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <Centred>
      <p className="flex items-center justify-center gap-2.5 text-[0.9375rem] text-text-secondary">
        <Spinner size="sm" />
        {children}
      </p>
    </Centred>
  );
}
