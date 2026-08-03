"use client";

import { ErrorState, Spinner } from "@vsolve/ui";

import { useApplicationReference } from "../reference-queries";
import { useApplicationEditor } from "./application-editor";

/**
 * The agreements an applicant accepts before review.
 *
 * Every purpose, title, version and link comes from
 * `GET /api/v1/partner/required-consents/`. None of it is hardcoded, and that is
 * the whole point: a consent receipt records *which document at which version*
 * someone agreed to, and it has to hold up if the agreement is ever disputed. A
 * checkbox posting a made-up `document_version` would produce a receipt for a
 * document nobody can identify.
 *
 * Because the version comes from the server, republishing legal text
 * automatically re-prompts every applicant — behaviour a hardcoded string could
 * never provide.
 *
 * Acceptance is append-only. Unticking removes it from this draft, but nothing
 * withdraws an acceptance already recorded: withdrawal is its own command with
 * its own audit, not the absence of a tick.
 */

export function ConsentStep() {
  const { draft, update, isReadOnly } = useApplicationEditor();

  const reference = useApplicationReference();

  if (reference.isPending) {
    return (
      <p className="flex items-center gap-2 py-6 text-text-secondary">
        <Spinner size="sm" />
        Loading the agreements…
      </p>
    );
  }

  if (reference.isError) {
    return (
      <ErrorState
        title="We could not load the agreements"
        message="Nothing has been accepted. Check your connection and try again."
        actionLabel="Try again"
        onAction={reference.refetch}
      />
    );
  }

  if (reference.requiredConsents.length === 0) {
    return (
      <p
        role="status"
        className="rounded-card border border-line bg-surface p-4 text-sm text-text-secondary"
      >
        There is nothing to agree to at the moment.
      </p>
    );
  }

  const isAccepted = (purpose: string, version: string) =>
    draft.consents.some(
      (consent) => consent.purpose === purpose && consent.documentVersion === version,
    );

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-base font-semibold text-text">Agreements</legend>
      <p className="mt-1 text-sm text-text-secondary">
        Read each one and tick to accept. We record which version you agreed to
        and when.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {reference.requiredConsents.map((document) => {
          const accepted = isAccepted(document.purpose, document.document_version);

          return (
            <div
              key={`${document.purpose}@${document.document_version}`}
              className={[
                "rounded-control border p-3",
                accepted ? "border-action bg-selected-surface" : "border-line bg-surface",
              ].join(" ")}
            >
              <label className="flex min-h-11 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={accepted}
                  disabled={isReadOnly}
                  onChange={() =>
                    update({
                      consents: accepted
                        ? draft.consents.filter(
                            (consent) =>
                              !(
                                consent.purpose === document.purpose &&
                                consent.documentVersion === document.document_version
                              ),
                          )
                        : [
                            ...draft.consents,
                            {
                              purpose: document.purpose,
                              documentVersion: document.document_version,
                            },
                          ],
                    })
                  }
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-action)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text">
                    I accept the {document.title}
                  </span>
                  <span className="block text-sm text-text-secondary">
                    Version {document.document_version}
                    {document.is_required_for_submission ? " · required" : " · optional"}
                  </span>
                </span>
              </label>

              {/* Opens in a new tab so reading the terms never costs a
                  half-filled application. */}
              <a
                href={document.document_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-info-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                Read the {document.title}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
