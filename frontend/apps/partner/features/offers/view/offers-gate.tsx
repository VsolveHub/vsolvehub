"use client";

import { useAuthGuard, useOtpFlow } from "@vsolve/query";
import { Card, ErrorState, OtpForm, Spinner } from "@vsolve/ui";
import Link from "next/link";

import { usePartnerApplication } from "@/features/application/queries";
import { getApiClient } from "@/lib/api/browser";

import { OfferInbox } from "./offer-inbox";

/**
 * Offers, behind a session and behind approval.
 *
 * Approval is checked for the same reason `PresenceGate` checks it: Django's
 * offer list is `IsPartnerUser` and an unapproved applicant has no Partner
 * profile, so the endpoint answers an empty page. Rendering "no offers right
 * now" to someone whose application is still in review is technically accurate
 * and completely misleading — it reads as "no work available" rather than "you
 * cannot receive work yet". The two need different screens.
 */
export function OffersGate() {
  const guard = useAuthGuard(getApiClient());
  const application = usePartnerApplication();
  const flow = useOtpFlow(getApiClient());

  if (guard.status === "checking") {
    return (
      <main className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-16 text-text-secondary">
        <Spinner size="sm" />
        Loading…
      </main>
    );
  }

  if (guard.status === "unauthenticated") {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <h1 className="text-2xl font-bold text-text">Your offers</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Log in to see the jobs being offered to you.
        </p>
        <div className="mt-6">
          <OtpForm {...flow} heading="Your mobile number" headingLevel={2} />
        </div>
      </main>
    );
  }

  if (guard.status !== "authenticated") {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16">
        <ErrorState
          title="We could not check your access"
          message="You are not online. Any offers waiting for you are unaffected — check your connection and try again."
          actionLabel="Try again"
          onAction={() => window.location.reload()}
        />
      </main>
    );
  }

  const isApproved = application.data?.status === "APPROVED";

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-text">Your offers</h1>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        Each offer is one visit. Accepting gives you two minutes to change your mind at no
        cost.
      </p>

      <div className="mt-6">
        {application.isPending ? (
          <p className="flex items-center gap-2 text-text-secondary">
            <Spinner size="sm" />
            Loading your account…
          </p>
        ) : isApproved ? (
          <OfferInbox />
        ) : (
          <Card className="p-5">
            <h2 className="text-base font-bold text-text">
              You are not approved to take work yet
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Offers start arriving once a reviewer has approved your application. This is
              not the same as there being no work — nothing is being offered to you yet.
            </p>
            <Link
              href="/apply"
              className="mt-4 inline-flex min-h-11 items-center font-semibold text-info-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              See your application
            </Link>
          </Card>
        )}
      </div>
    </main>
  );
}
