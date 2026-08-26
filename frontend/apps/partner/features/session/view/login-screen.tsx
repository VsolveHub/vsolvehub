"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { useAuthGuard, useOtpFlow } from "@vsolve/query";
import { ErrorState, Logo, OtpForm, Spinner } from "@vsolve/ui";
import { HelpCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { usePartnerApplication } from "@/features/application/queries";
import { getApiClient } from "@/lib/api/browser";

import { homeForApplication, safeNextPath } from "../model/redirect";

/**
 * The one OTP surface for the whole Partner app.
 *
 * There were three before this — inside onboarding, inside offers and inside
 * availability — each on a URL that described a page the person could not see.
 * Signing in on `/offers` left the browser at `/offers` showing a phone field,
 * so there was nothing to return *to* and no way to link anyone into the product
 * from the marketing site. Login is a place now.
 *
 * ## Where it sends people
 *
 * A validated `?next=` wins, so a deep link survives an expired cookie. With
 * nothing to return to, the destination depends on the application: `/apply`
 * while there is still work for them there, the home otherwise. Both decisions
 * live in `../model/redirect` — the `?next=` half is a security boundary and is
 * tested as one.
 */
export function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const guard = useAuthGuard(getApiClient());
  const isAuthenticated = guard.status === "authenticated";

  // Only once there is a session. Asking Django for an application while nobody
  // is signed in spends a guaranteed refusal on every visit to this screen.
  const application = usePartnerApplication({ enabled: isAuthenticated });
  // Deliberately no `intendedRole: "partner"` here: this is the same form a
  // first-time applicant uses ("Not a Partner yet? Apply to join", below) —
  // `homeForApplication` sends anyone with no application at all to `/apply`
  // straight after this OTP succeeds. Gating the OTP itself on already holding
  // the Partner role would lock out every new applicant on their very first
  // sign-in, since nobody holds that role before they have applied once.
  const flow = useOtpFlow(getApiClient());

  const next = safeNextPath(searchParams.get("next"));

  // A 404 is an answer — "you have never applied" — not a failure to wait on.
  const isMissing =
    application.error instanceof ApiRequestError && application.error.status === 404;
  const knowsWhereToGo = !application.isPending || isMissing;

  useEffect(() => {
    if (!isAuthenticated) return;

    // An explicit destination needs no lookup: the person already said where
    // they were going before the session interrupted them.
    if (next) {
      router.replace(next);
      return;
    }

    if (!knowsWhereToGo) return;
    router.replace(homeForApplication(application.data?.status ?? null));
  }, [application.data?.status, isAuthenticated, knowsWhereToGo, next, router]);

  if (guard.status === "checking") {
    return <Waiting>Checking your session…</Waiting>;
  }

  if (guard.status === "error") {
    return (
      <Frame>
        <ErrorState
          title="We could not check your session"
          message="Nothing has changed. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => window.location.reload()}
        />
      </Frame>
    );
  }

  // Already signed in, or just now signed in: the effect above is navigating.
  // Re-showing the form here is how someone ends up logging in twice.
  if (isAuthenticated) {
    return <Waiting>Taking you to your account…</Waiting>;
  }

  return (
    <Frame>
      {/*
        The illustration, sized as an accent rather than a hero.

        It was a 280px square filling the top of the card — the largest paint on
        the first screen a Partner ever sees, on the slowest connection they
        will ever be on, above a form they came here to use. At 132px it still
        says what kind of app this is and the phone field is above the fold on a
        360×640 device, which is the screen this has to work on.
      */}
      <div className="flex flex-col items-center gap-3.5 pb-1">
        <Image
          src="/image.png"
          alt=""
          width={224}
          height={224}
          priority
          className="vsh-hero-slideup h-28 w-28"
        />
        <Logo className="h-8 w-auto" />
      </div>

      <h1 className="text-center text-headline text-text">Log in to work</h1>

      {/*
        One statement of the rule, not three.

        This screen used to say "We will text you a code — there is no password"
        as a page description, then again as `OtpForm`'s `description`, then a
        third time as the field's own hint. Beyond being noise it cost about
        130px above the fold — enough that on a 360x640 Android, the floor this
        product is built for, **Send code** was off screen. The field's own hint
        is the most specific of the three and is the one kept.
      */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <OtpForm
          {...flow}
          heading="Your mobile number"
          headingLevel={2}
          verifyLabel="Verify and continue"
        />
      </div>

      {/*
        Applying is a separate destination, not a footnote inside the form.

        It used to be a sentence in `OtpForm`'s `footer`, which put the one link
        for everybody who does *not* yet have an account underneath the code
        field — a control that only appears on step two, and that a first-time
        visitor has no reason to reach. It is a peer of the form now.
      */}
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface-sunken p-4 text-center">
        <p className="text-body font-bold text-text">Not a Partner yet?</p>
        <p className="text-caption leading-relaxed text-text-secondary">
          Applying takes a few minutes and does not commit you to anything.
        </p>
        <Link
          href="/apply"
          className="pv-tap pv-press flex h-12 items-center justify-center rounded-control border border-line-strong bg-surface text-body font-bold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          Apply to join
        </Link>
      </div>

      <p className="flex items-center justify-center gap-1.5 pb-2 text-caption text-text-muted">
        <HelpCircle size={15} aria-hidden />
        Trouble logging in? Call the number on your agreement.
      </p>
    </Frame>
  );
}

/**
 * The one column every branch of this screen renders inside.
 *
 * Centred and capped at the same 480px the signed-in shell uses, so arriving at
 * the app does not change its width. `justify-center` on short content and
 * top-aligned once the form outgrows the viewport — `my-auto` on the inner
 * stack does both without a media query.
 */
function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh justify-center bg-canvas px-5">
      <div
        className="my-auto flex w-full max-w-[480px] flex-col gap-5 py-8"
        style={{ paddingTop: "calc(2rem + var(--safe-top))", paddingBottom: "calc(2rem + var(--safe-bottom))" }}
      >
        {children}
      </div>
    </main>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <Frame>
      <p className="flex items-center justify-center gap-2.5 text-body text-text-secondary">
        <Spinner size="sm" />
        {children}
      </p>
    </Frame>
  );
}
