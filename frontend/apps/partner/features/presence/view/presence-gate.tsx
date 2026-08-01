"use client";

import { useAuthGuard, useOtpFlow } from "@vsolve/query";
import { Card, ErrorState, OtpForm, Spinner } from "@vsolve/ui";
import Link from "next/link";

import { getApiClient } from "@/lib/api/browser";
import { useApplicationReference } from "@/features/application/reference-queries";
import { usePartnerApplication } from "@/features/application/queries";

import { PresencePanel } from "./presence-panel";

/**
 * Availability, behind a session and behind approval.
 *
 * Approval is checked because Django checks it: presence fails closed for an
 * unapproved Partner. Showing the control to someone who cannot use it produces
 * a refusal they cannot act on, so an application still in review gets a
 * sentence explaining where it is instead.
 *
 * The consent version handed to `PresencePanel` is the one the Partner actually
 * accepted, read from their own application. Going online records a location
 * against a consent receipt, so the version has to be the one on file rather
 * than the newest published — those differ exactly when legal text was
 * republished and the Partner has not re-accepted.
 */
export function PresenceGate() {
  const guard = useAuthGuard(getApiClient());
  const application = usePartnerApplication();
  const reference = useApplicationReference();
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
        <h1 className="text-2xl font-bold text-text">Your availability</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Log in to go online and start receiving jobs.
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
          message="You are not online. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => window.location.reload()}
        />
      </main>
    );
  }

  const record = application.data ?? null;
  const isApproved = record?.status === "APPROVED";

  // The version on file, not the newest published: going online records a
  // location against a consent the Partner actually gave.
  const acceptedConsent =
    record?.consents.find(
      (consent) =>
        consent.withdrawn_at === null &&
        reference.requiredConsents.some(
          (document) =>
            document.purpose === consent.purpose &&
            document.document_version === consent.document_version,
        ),
    ) ?? null;

  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="text-2xl font-bold text-text">Your availability</h1>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        You are only offered work while you are online.
      </p>

      <div className="mt-6">
        {application.isPending ? (
          <p className="flex items-center gap-2 text-text-secondary">
            <Spinner size="sm" />
            Loading your account…
          </p>
        ) : isApproved ? (
          <PresencePanel consentVersion={acceptedConsent?.document_version ?? null} />
        ) : (
          <Card className="p-5">
            <h2 className="text-base font-bold text-text">
              You are not approved to take work yet
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Going online opens once a reviewer has approved your application.
              Nothing is waiting on you here.
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
