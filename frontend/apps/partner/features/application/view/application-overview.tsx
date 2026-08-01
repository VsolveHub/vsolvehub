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
