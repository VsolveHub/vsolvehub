"use client";

import type { Schemas } from "@vsolve/api-client";
import { Badge } from "@vsolve/ui";
import Link from "next/link";

import { requirements, rejectedDocuments } from "../model/readiness";

/**
 * What is done and what is left, with a way to each remaining item.
 *
 * Shown as one list including the completed items rather than only the missing
 * ones. Onboarding is long enough that seeing progress matters, and a list that
 * shrinks as you work gives no sense of how much is left.
 *
 * Rejected documents are called out separately above the list. They are not the
 * same as a missing document — the Partner did upload something, a reviewer
 * looked at it and said no, and the reason is the most useful thing on the
 * screen.
 */

type Application = Schemas["PartnerApplication"];

const DOCUMENT_LABELS: Record<Schemas["PartnerDocumentKindEnum"], string> = {
  GOVERNMENT_ID: "Government photo ID",
  ADDRESS_PROOF: "Proof of address",
  TAX: "Tax document",
  BANK: "Bank document",
  BACKGROUND_CHECK: "Background check",
  OTHER: "Document",
};

export interface ReadinessChecklistProps {
  application: Application;
}

export function ReadinessChecklist({ application }: ReadinessChecklistProps) {
  const items = requirements(application);
  const rejected = rejectedDocuments(application);
  const remaining = items.filter((item) => !item.isMet).length;

  return (
    <section>
      {rejected.length > 0 ? (
        <div
          role="alert"
          className="mb-4 rounded-card border border-warning-line bg-warning-surface p-4"
        >
          <h3 className="text-sm font-semibold text-text">Replace these documents</h3>
          <ul className="mt-2 flex list-none flex-col gap-2 p-0">
            {rejected.map((document) => (
              <li key={document.id}>
                <p className="text-sm font-medium text-text">
                  {DOCUMENT_LABELS[document.kind]}
                </p>
                {/* The reviewer's reason, verbatim. Summarising it is how a
                    Partner re-uploads the same unusable photo three times. */}
                {document.review_reason ? (
                  <p className="text-sm text-text-secondary">{document.review_reason}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <Link
            href="/apply/documents"
            className="mt-3 inline-flex min-h-11 items-center font-semibold text-info-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            Upload replacements
          </Link>
        </div>
      ) : null}

      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-text">Your application</h3>
        <p className="text-sm text-text-secondary" aria-live="polite">
          {remaining === 0 ? "Everything is done" : `${remaining} left`}
        </p>
      </div>

      <ul className="mt-3 flex list-none flex-col gap-1 p-0">
        {items.map((item) => (
          <li
            key={item.code}
            className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0"
          >
            <span className="flex min-w-0 items-center gap-2">
              {/* State is carried by the badge text, not by colour alone. */}
              <Badge tone={item.isMet ? "success" : "neutral"}>
                {item.isMet ? "Done" : "To do"}
              </Badge>
              <span className="min-w-0 text-text">{item.label}</span>
            </span>

            {item.isMet ? null : (
              <Link
                href={item.href}
                className="min-h-11 shrink-0 content-center rounded-control px-3 font-semibold text-info-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                Add
                <span className="sr-only"> {item.label.toLowerCase()}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
