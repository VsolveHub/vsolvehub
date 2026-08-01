"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { Button, ErrorState, Spinner } from "@vsolve/ui";
import Link from "next/link";

import { canSubmit, isEditable, outstandingRequirements } from "../model/readiness";
import { isVersionConflict, usePartnerApplication, useSubmitApplication } from "../queries";
import { ReadinessChecklist } from "./readiness-checklist";
import { ApplicationStatusBanner } from "./status-banner";

/**
 * The last screen before a human reads the application.
 *
 * It must not decide the application is complete. `canSubmit` is a presentation
 * of readiness and Django is the authority, so a refusal is rendered as the
 * server's answer rather than as a client rule the applicant cannot see.
 *
 * Consents are accepted on `/apply/consent`, against the versions
 * `GET /api/v1/partner/required-consents/` publishes. This screen only lists
 * what is already on file: a receipt records which document at which version
 * someone agreed to, and duplicating that control here would risk recording it
 * twice.
 */

export function ReviewStep() {
  const query = usePartnerApplication();
  const submit = useSubmitApplication();

  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <p className="flex items-center gap-2 py-8 text-text-secondary">
        <Spinner size="sm" />
        Loading your application…
      </p>
    );
  }

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

  const application = query.data ?? null;

  if (application === null) {
    return (
      <section>
        <h1 className="text-xl font-bold text-text sm:text-2xl">Review and send</h1>
        <p className="mt-2 text-sm text-text-secondary">
          There is nothing to review yet.
        </p>
        <Link
          href="/apply/about"
          className="mt-4 inline-flex min-h-11 items-center font-semibold text-info-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          Start your application
        </Link>
      </section>
    );
  }

  const outstanding = outstandingRequirements(application);
  const ready = canSubmit(application);
  const activeConsents = application.consents.filter(
    (consent) => consent.withdrawn_at === null,
  );

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-text sm:text-2xl">Review and send</h1>
        <p className="mt-1.5 max-w-prose text-sm text-text-secondary">
          Check everything below, then send it to a reviewer. You will not be
          offered any work until you are approved.
        </p>
      </div>

      <ApplicationStatusBanner application={application} />

      <ReadinessChecklist application={application} />

      <div className="border-t border-line pt-4">
        <h2 className="text-sm font-semibold text-text">Agreements</h2>

        {activeConsents.length > 0 ? (
          <ul className="mt-2 flex list-none flex-col gap-1 p-0">
            {activeConsents.map((consent) => (
              <li key={consent.id} className="text-sm text-text-secondary">
                {consent.purpose.replace(/_/g, " ")} — version {consent.document_version},
                accepted{" "}
                <time dateTime={consent.accepted_at}>
                  {new Intl.DateTimeFormat("en-IN", {
                    dateStyle: "medium",
                    timeZone: "Asia/Kolkata",
                  }).format(new Date(consent.accepted_at))}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p
            role="status"
            className="mt-2 rounded-card border border-warning-line bg-warning-surface p-4 text-sm text-text"
          >
            You have not accepted the Partner agreements yet.{" "}
            <Link
              href="/apply/consent"
              className="font-semibold text-info-text underline underline-offset-4"
            >
              Read and accept them
            </Link>{" "}
            before sending your application.
          </p>
        )}
      </div>

      {isEditable(application) ? (
        <div className="border-t border-line pt-4">
          {isVersionConflict(submit.error) ? (
            <ErrorState
              inline
              className="mb-3"
              severity="warning"
              title="Your application changed while you were here"
              message="We have reloaded the latest version. Check it, then send it again."
            />
          ) : submit.isError ? (
            <ErrorState
              inline
              className="mb-3"
              title="We could not send it for review"
              message="Nothing was submitted and nothing was lost. Finish what is left above and try again."
              reference={
                submit.error instanceof ApiRequestError ? submit.error.requestId : null
              }
            />
          ) : null}

          <Button
            size="lg"
            disabled={!ready}
            loading={submit.isPending}
            loadingLabel="Sending for review"
            onClick={() => submit.mutate()}
          >
            Send for review
          </Button>

          <p className="mt-2 text-sm text-text-secondary">
            {ready
              ? "A reviewer will check your documents and get back to you."
              : `${outstanding.length} thing${outstanding.length === 1 ? "" : "s"} still to finish.`}
          </p>
        </div>
      ) : null}
    </section>
  );
}
