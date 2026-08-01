"use client";

import type { Schemas } from "@vsolve/api-client";
import { Button } from "@vsolve/ui";

import type { QuoteView } from "../adapters";
import type { Stage } from "../model/stages";
import { CancellationLadder } from "./cancellation-ladder";
import { useWorkspace } from "./workspace-context";

/**
 * Review — everything the customer is about to commit to, in one place.
 *
 * Address, what was chosen, the arrival window, the estimated duration, the
 * cancellation policy and the complete quote. Every row is editable, and editing
 * jumps back to the stage that owns it rather than opening a modal, so there is
 * one place each answer can be changed.
 *
 * The copy below "Continue" matters more than it looks. This is the last screen
 * before the Partner search, and M1's ordering (ADR-012) is unfamiliar: the
 * customer is about to wait while a professional is asked, and they are *not*
 * about to be charged. Saying so here prevents the search screen from reading
 * like a failed payment.
 */

interface ReviewRow {
  label: string;
  value: string;
  stage: Stage;
}

export interface ReviewStageProps {
  quote: QuoteView | null;
  service: Schemas["ServiceDetail"];
  addressLine: string | null;
  windowLabel: string | null;
  /** Owned by the checkout stage — this stage only reports that it is ready. */
  onContinue?: () => void;
  continueLabel?: string;
}

export function ReviewStage({
  quote,
  service,
  addressLine,
  windowLabel,
  onContinue,
  continueLabel = "Find a professional",
}: ReviewStageProps) {
  const { state, goTo } = useWorkspace();

  const rows: ReviewRow[] = [
    { label: "Address", value: addressLine ?? "Not set", stage: "address" },
    { label: "Arrival window", value: windowLabel ?? "Not set", stage: "window" },
  ];

  // Duration comes from the quote, never from local state: it is the server's
  // capacity estimate for the chosen task lines (ADR-008), not a customer input.
  if (quote !== null) {
    rows.push({
      label: "Estimated time on site",
      value: `About ${quote.estimatedDurationMinutes} minutes`,
      stage: "scope",
    });
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-text">Check the details</h2>

      <div className="mt-4 rounded-card border border-line bg-surface">
        <div className="border-b border-line p-4">
          <p className="font-semibold text-text">{service.name}</p>
          <ul className="mt-1 flex list-none flex-col gap-0.5 p-0 text-sm text-text-secondary">
            {state.taskLines.map((line) => (
              <li key={line.taskCode}>
                {line.quantity} × {line.taskCode}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => goTo("scope")}
            className="mt-2 min-h-11 rounded-control font-semibold text-info-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            Change
            <span className="sr-only"> what you need done</span>
          </button>
        </div>

        <dl className="flex flex-col">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-3 border-b border-line p-4 last:border-0"
            >
              <div className="min-w-0">
                <dt className="text-sm text-text-secondary">{row.label}</dt>
                <dd className="mt-0.5 text-text">{row.value}</dd>
              </div>
              <button
                type="button"
                onClick={() => goTo(row.stage)}
                className="min-h-11 shrink-0 rounded-control px-3 font-semibold text-info-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                Change
                <span className="sr-only"> {row.label.toLowerCase()}</span>
              </button>
            </div>
          ))}
        </dl>
      </div>

      {state.notes ? (
        <div className="mt-4 rounded-card border border-line bg-surface p-4">
          <p className="text-sm text-text-secondary">Your note</p>
          <p className="mt-1 text-text">{state.notes}</p>
        </div>
      ) : null}

      {quote ? (
        <div className="mt-4">
          <CancellationLadder
            bands={quote.cancellationBands}
            policyVersion={quote.cancellationPolicyVersion}
          />
        </div>
      ) : null}

      {onContinue ? (
        <div className="mt-6">
          <Button onClick={onContinue} disabled={quote === null}>
            {continueLabel}
          </Button>
          <p className="mt-2 text-sm text-text-secondary">
            {quote === null
              ? "Waiting for your final price."
              : "We will ask a professional to take this job. You are not charged until one accepts."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
