"use client";

import { ErrorState, Spinner } from "@vsolve/ui";
import { useApplicationReference } from "../reference-queries";
import { useApplicationEditor } from "./application-editor";

export function ConsentStep() {
  const { draft, update, isReadOnly } = useApplicationEditor();
  const reference = useApplicationReference();

  if (reference.isPending) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-text-secondary">
        <Spinner size="sm" />
        Loading agreements…
      </p>
    );
  }

  if (reference.isError) {
    return (
      <ErrorState
        title="Could not load agreements"
        message="Check your connection and try again."
        actionLabel="Try again"
        onAction={reference.refetch}
      />
    );
  }

  if (reference.requiredConsents.length === 0) {
    return (
      <p
        role="status"
        className="rounded-control border border-line bg-surface p-4 text-sm text-text-secondary"
      >
        No agreements are required at this time.
      </p>
    );
  }

  const isAccepted = (purpose: string, version: string) =>
    draft.consents.some(
      (consent) => consent.purpose === purpose && consent.documentVersion === version,
    );

  const requiredConsents = reference.requiredConsents.filter(
    (c) => c.is_required_for_submission,
  );
  const allRequiredAccepted =
    requiredConsents.length > 0 &&
    requiredConsents.every((c) => isAccepted(c.purpose, c.document_version));

  return (
    <fieldset className="border-0 p-0 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-bold text-navy-900">
          Required Agreements <span className="text-danger-text">*</span>
        </legend>

        {!isReadOnly && requiredConsents.length > 1 && (
          <button
            type="button"
            onClick={() => {
              if (allRequiredAccepted) {
                const requiredKeys = new Set(
                  requiredConsents.map((c) => `${c.purpose}@${c.document_version}`),
                );
                update({
                  consents: draft.consents.filter(
                    (c) => !requiredKeys.has(`${c.purpose}@${c.documentVersion}`),
                  ),
                });
              } else {
                const existing = [...draft.consents];
                for (const doc of requiredConsents) {
                  if (!isAccepted(doc.purpose, doc.document_version)) {
                    existing.push({
                      purpose: doc.purpose,
                      documentVersion: doc.document_version,
                    });
                  }
                }
                update({ consents: existing });
              }
            }}
            className="text-xs font-semibold text-navy-700 hover:text-signal-700"
          >
            {allRequiredAccepted ? "Deselect all" : "Accept all required"}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {reference.requiredConsents.map((document) => {
          const accepted = isAccepted(document.purpose, document.document_version);

          return (
            <div
              key={`${document.purpose}@${document.document_version}`}
              className={[
                "rounded-control border p-3.5 transition-colors",
                accepted
                  ? "border-action bg-selected-surface"
                  : "border-line bg-surface hover:border-line-strong",
              ].join(" ")}
            >
              <label className="flex cursor-pointer items-start gap-3">
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
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--color-action)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-text">
                      I agree to the {document.title}
                    </span>
                    {document.is_required_for_submission ? (
                      <span className="text-xs font-semibold text-danger-text">* Required</span>
                    ) : (
                      <span className="text-xs text-text-muted">Optional</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-text-secondary">
                    <span>Version {document.document_version}</span>
                    <a
                      href={document.document_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-navy-900 hover:bg-surface-sunken hover:border-line-strong transition-colors shadow-xs"
                    >
                      <span>Read document</span>
                      <span>↗</span>
                    </a>
                  </div>
                </div>
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
