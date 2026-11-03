"use client";

import type { Schemas } from "@vsolve/api-client";
import { useT } from "@vsolve/ui";

type ConsentDocument = Schemas["PartnerConsentDocument"];

export function consentKey(purpose: string, version: string): string {
  return `${purpose}@${version}`;
}

/**
 * The agreements to accept, as checkboxes. Accepted on the screen that sends the application.
 *
 * An agreement already on file is shown ticked and locked: receipts are append-only on the
 * server, so offering to untick one would be a control that does nothing.
 */
export function ConsentList({
  documents,
  accepted,
  locked,
  disabled = false,
  onToggle,
}: {
  documents: readonly ConsentDocument[];
  /** Keys (`consentKey`) ticked now, saved or not. */
  accepted: ReadonlySet<string>;
  /** Keys already recorded on the server. */
  locked: ReadonlySet<string>;
  disabled?: boolean;
  onToggle: (document: ConsentDocument) => void;
}) {
  const t = useT();

  if (documents.length === 0) {
    return <p className="text-sm text-text-secondary">{t("apply.consent.empty")}</p>;
  }

  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {documents.map((document) => {
        const key = consentKey(document.purpose, document.document_version);
        const isAccepted = accepted.has(key);
        const isLocked = locked.has(key);
        return (
          <li
            key={key}
            className={[
              "flex items-start gap-3 rounded-control border p-3",
              isAccepted ? "border-action bg-selected-surface" : "border-line bg-surface",
            ].join(" ")}
          >
            <input
              id={`consent-${key}`}
              type="checkbox"
              checked={isAccepted}
              disabled={disabled || isLocked}
              onChange={() => onToggle(document)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-strong accent-action cursor-pointer"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor={`consent-${key}`} className="text-sm font-medium text-text cursor-pointer break-words">
                {t("apply.consent.iAgreeTo", { title: document.title })}
              </label>
              <a
                href={document.document_url}
                target="_blank"
                rel="noreferrer"
                className="self-start text-xs font-semibold text-action underline underline-offset-2"
              >
                {t("apply.consent.readDocument")}
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
