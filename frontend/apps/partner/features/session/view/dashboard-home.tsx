"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { useAuthGuard } from "@vsolve/query";
import { ErrorState, Spinner } from "@vsolve/ui";
import Link from "next/link";

import { usePartnerApplication } from "@/features/application/queries";
import { ReadinessChecklist } from "@/features/application/view/readiness-checklist";
import { ApplicationStatusBanner } from "@/features/application/view/status-banner";
import { OfferInbox } from "@/features/offers/view/offer-inbox";
import { PartnerPresence } from "@/features/presence/view/partner-presence";
import { getApiClient } from "@/lib/api/browser";

import { PARTNER_ROLE, SwitchToPartner } from "../partner-shell";

/**
 * The signed-in home.
 *
 * One screen that answers "what now?" for every state an application can be in,
 * because that question has a different answer at each one and the Partner app
 * previously answered it nowhere: an approved Partner landed on a page whose
 * only outgoing link was hidden precisely because they were approved.
 *
 * The status copy is `ApplicationStatusBanner`'s, never restated here. A second
 * table of the same seven states is a second thing to keep true.
 */

const PRIMARY_LINK =
  "inline-flex min-h-12 items-center rounded-control bg-action px-7 font-semibold text-action-text hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action";

const QUIET_LINK =
  "inline-flex min-h-11 items-center font-semibold text-info-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action";

function Home({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-text">{title}</h1>
      <div className="mt-6 flex flex-col gap-6">{children}</div>
    </main>
  );
}

export function DashboardHome() {
  const query = usePartnerApplication();
  const guard = useAuthGuard(getApiClient());

  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <Home title="Your work">
        <p className="flex items-center gap-2 text-text-secondary">
          <Spinner size="sm" />
          Loading your account…
        </p>
      </Home>
    );
  }

  if (query.isError && !isMissing) {
    return (
      <Home title="Your work">
        <ErrorState
          title="We could not load your account"
          message="Nothing you have saved is lost. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void query.refetch()}
        />
      </Home>
    );
  }

  // A 404 is a state, not a failure: this person has never applied.
  if (isMissing || query.data === undefined) {
    return (
      <Home title="Start your application">
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          It takes a few minutes. You can stop and come back — nothing is sent for
          review until you choose to send it.
        </p>
        <div>
          <Link href="/apply/about" className={PRIMARY_LINK}>
            Begin
          </Link>
        </div>
      </Home>
    );
  }

  const application = query.data;

  if (application.status === "APPROVED") {
    return (
      <Home title="Your work">
        {/*
          Django selects the alphabetically first grant at login, so a Partner who
          is also a Customer arrives acting as `customer` and every offer request
          would 403. The inbox is withheld until the session is acting as Partner
          — showing it and letting each request fail is the version of this screen
          that reads as "the app is broken".
        */}
        {guard.activeRole === PARTNER_ROLE ? (
          <>
            <section>
              <h2 className="sr-only">Offers</h2>
              <OfferInbox />
            </section>

            <section className="border-t border-line pt-6">
              <PartnerPresence />
              <p className="mt-3">
                <Link href="/availability" className={QUIET_LINK}>
                  Set the hours you work
                </Link>
              </p>
            </section>
          </>
        ) : (
          <SwitchToPartner inline />
        )}
      </Home>
    );
  }

  if (application.status === "SUSPENDED" || application.status === "OFFBOARDED") {
    // No offers and no presence control: both are refused by Django in these
    // states, and an appeal runs through support rather than this screen.
    return (
      <Home title="Your account">
        <ApplicationStatusBanner application={application} />
      </Home>
    );
  }

  if (application.status === "SUBMITTED" || application.status === "UNDER_REVIEW") {
    return (
      <Home title="Your application">
        <ApplicationStatusBanner application={application} />
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          Job offers start once a reviewer has approved you. There is nothing
          waiting on you in the meantime, and you do not need to check back — we
          will message you.
        </p>
      </Home>
    );
  }

  // DRAFT and CHANGES_REQUIRED: the work is theirs, and it is on `/apply`.
  return (
    <Home title="Your application">
      <ApplicationStatusBanner application={application} />
      <ReadinessChecklist application={application} />
      <div className="border-t border-line pt-4">
        <Link href="/apply/review" className={PRIMARY_LINK}>
          Continue your application
        </Link>
      </div>
    </Home>
  );
}
