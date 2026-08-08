"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { useAuthGuard, useOtpFlow } from "@vsolve/query";
import { Card, ErrorState, Logo, OtpForm, Spinner } from "@vsolve/ui";
import { HelpCircle } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

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

  // Already signed in, or just now signed in: the effect above is navigating.
  // Re-showing the form here is how someone ends up logging in twice.
  if (isAuthenticated) {
    return (
      <main className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-16 text-text-secondary">
        <Spinner size="sm" />
        Taking you to your account…
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      {/* Hero illustration card */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-center bg-surface px-6 pt-6">
          {/* `next/image` rather than a bare tag: this is the largest paint on
              the first screen a Partner ever sees, often on a slow connection,
              and it is the one image worth serving at the right size. */}
          <Image
            src="/image.png"
            alt="Partner tradespeople — weekly payouts, flexible hours, transparent earnings"
            width={280}
            height={280}
            priority
            className="vsh-hero-slideup mx-auto h-auto w-full max-w-[280px]"
          />
        </div>

        {/* Orange accent divider */}
        <div className="h-[3px] bg-action" />

        {/* OTP form */}
        <div className="p-6 sm:p-8">
          <Logo className="h-8 w-auto" />
          <h1 className="mt-6 text-2xl font-bold text-text">Partner log in</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Use the mobile number your Partner account is on. We will text you a
            code — there is no password.
          </p>

          <div className="mt-6">
            <OtpForm
              {...flow}
              heading="Your mobile number"
              headingLevel={2}
              description="We will text you a code. There is no password."
              verifyLabel="Verify and continue"
              footer={
                <p>
                  Not a Partner yet?{" "}
                  <a
                    href="/apply"
                    className="font-semibold text-info-text underline-offset-4 hover:underline"
                  >
                    Apply to join
                  </a>{" "}
                  — it takes a few minutes and does not commit you to anything.
                </p>
              }
            />
          </div>
        </div>
      </Card>

      {/* Help link */}
      <p className="mt-6 flex items-center justify-center gap-1.5 text-sm text-text-muted">
        <HelpCircle size={16} aria-hidden />
        Need help logging in?
      </p>
    </main>
  );
}
