"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { ErrorState, Spinner } from "@vsolve/ui";
import Link from "next/link";

import { canSubmit, isEditable, outstandingRequirements } from "../model/readiness";
import { usePartnerApplication } from "../queries";
import { ReadinessChecklist } from "./readiness-checklist";
import { ApplicationStatusBanner } from "./status-banner";

/**
 * The application's home screen: where it stands, what is left, and its history.
 *
 * Submitting lives on `/apply/review` rather than here. One place that sends an
 * application means one place that has to get the confirmation, the conflict
 * recovery and the "you are not approved yet" wording right.
 */

export function ApplicationOverview() {
  const query = usePartnerApplication();

  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <p className="flex items-center gap-2 py-8 text-text-secondary">
        <Spinner size="sm" />
        Loading your application…
      </p>
    );
  }

  if (isMissing || query.data === undefined) {
    if (query.isError && !isMissing) {
      return (
        <ErrorState
          title="We could not load your application"
          message="Nothing you have saved is lost. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void query.refetch()}
        />
      );
    }

    return (
      <section>
        <h1 className="text-xl font-bold text-text sm:text-2xl">Start your application</h1>
        <p className="mt-2 max-w-prose text-sm text-text-secondary">
          It takes a few minutes. You can stop and come back — nothing is sent
          for review until you choose to send it.
        </p>
        <Link
          href="/apply/about"
          className="mt-5 inline-flex min-h-12 items-center rounded-control bg-action px-7 font-semibold text-action-text hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          Begin
        </Link>
      </section>
    );
  }

  const application = query.data;
  const outstanding = outstandingRequirements(application);
  const ready = canSubmit(application);

  return (
    <section className="flex flex-col gap-6">
      {/*
        The route's level-one heading.

        It was missing entirely once an application existed: the page opened at
        `h2`, so a screen-reader user navigating by heading landed inside a
        status banner with no idea what page they were on. The "start your
        application" branch above had an `h1` and this one did not, which is why
        it was easy to miss — the empty state looked correct.
      */}
      <h1 className="text-xl font-bold text-text sm:text-2xl">Your application</h1>

      <ApplicationStatusBanner application={application} />

      <ReadinessChecklist application={application} />

      {isEditable(application) ? (
        <div className="border-t border-line pt-4">
          <Link
            href="/apply/review"
            className="inline-flex min-h-12 items-center rounded-control bg-action px-7 font-semibold text-action-text hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            {ready ? "Review and send" : "Continue"}
          </Link>
          <p className="mt-2 text-sm text-text-secondary">
            {ready
              ? "Everything is done. Check it once and send it to a reviewer."
              : `${outstanding.length} thing${outstanding.length === 1 ? "" : "s"} still to finish above.`}
          </p>
        </div>
      ) : null}

      {/*
        The entry point to the M2 registration surface.

        A quiet link rather than a step in the strip above: workforce and project
        approval is asked for when a Partner wants it, and adding it to the
        eight-step path would tell every applicant they have a ninth thing to do.
        The screen behind it shows an honest empty state when none of their
        services is open to it, so the link never leads to a promise.
      */}
      <div className="border-t border-line pt-4">
        <h2 className="text-sm font-semibold text-text">Specialist work</h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Supplying a crew by the day, or quoting for a whole project, is reviewed separately from
          ordinary jobs. Asking costs nothing and does not affect the work you already do.
        </p>
        <Link
          href="/apply/capabilities"
          className="mt-3 inline-flex min-h-11 items-center rounded-control border border-line px-5 text-sm font-semibold text-text hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          See what you can apply for
        </Link>
      </div>

      {/*
        Approval used to end the page.

        The only outgoing link was gated on `isEditable`, which is false once an
        application is APPROVED — so the screen collapsed to a heading, a banner
        and a history, and the banner's own "publish the hours you want to work"
        pointed at nothing. Approval is the moment there is somewhere to go, not
        the moment the links disappear.
      */}
      {application.status === "APPROVED" ? (
        <div className="flex flex-wrap gap-3 border-t border-line pt-4">
          <Link
            href="/dashboard"
            className="inline-flex min-h-12 items-center rounded-control bg-action px-7 font-semibold text-action-text hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            Go to your work
          </Link>
          <Link
            href="/availability"
            className="inline-flex min-h-12 items-center rounded-control border border-line px-7 font-semibold text-text hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            Set your hours
          </Link>
        </div>
      ) : null}

      {application.transitions.length > 0 ? (
        <div className="border-t border-line pt-4">
          <h2 className="text-sm font-semibold text-text">What has happened so far</h2>
          <ol className="mt-3 flex list-none flex-col gap-3 p-0">
            {application.transitions.map((transition) => (
              <li key={transition.id} className="text-sm">
                <p className="text-text">
                  {transition.from_status} → {transition.to_status}
                </p>
                {/* The reviewer's own words, never summarised. */}
                {transition.reason ? (
                  <p className="text-text-secondary">{transition.reason}</p>
                ) : null}
                <time dateTime={transition.occurred_at} className="text-text-muted">
                  {new Intl.DateTimeFormat("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  }).format(new Date(transition.occurred_at))}
                </time>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
