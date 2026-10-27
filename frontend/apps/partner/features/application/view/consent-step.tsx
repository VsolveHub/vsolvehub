"use client";

import { ErrorState, Spinner, useT } from "@vsolve/ui";
import { useApplicationReference } from "../reference-queries";
import { useApplicationEditor } from "./application-editor";

export function ConsentStep() {
  const t = useT();
  const { draft, update, isReadOnly } = useApplicationEditor();
  const reference = useApplicationReference();

  if (reference.isPending) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-text-secondary">
        <Spinner size="sm" />
        {t("apply.consent.loading")}
      </p>
    );
  }

  if (reference.isError) {
    return (
      <ErrorState
        title={t("apply.consent.loadError.title")}
        message={t("apply.common.checkConnectionAndRetry")}
        actionLabel={t("common.tryAgain")}
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
        {t("apply.consent.empty")}
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
          {t("apply.consent.legend")} <span className="text-danger-text">*</span>
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
            {allRequiredAccepted ? t("apply.areas.deselectAll") : t("apply.consent.acceptAllRequired")}
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
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text flex-1 min-w-[12rem]">
                      {t("apply.consent.iAgreeTo", { title: document.title })}
                    </span>
                    {document.is_required_for_submission ? (
                      <span className="text-xs font-semibold text-danger-text shrink-0">* {t("common.required")}</span>
                    ) : (
                      <span className="text-xs text-text-muted shrink-0">{t("common.optional")}</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 flex-wrap text-xs text-text-secondary">
                    <span>{t("apply.consent.version", { version: document.document_version })}</span>
                    <a
                      href={document.document_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-navy-900 hover:bg-surface-sunken hover:border-line-strong transition-colors shadow-xs"
                    >
                      <span>{t("apply.consent.readDocument")}</span>
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
