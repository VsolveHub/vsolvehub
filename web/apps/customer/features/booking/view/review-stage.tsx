"use client";

import type { Schemas } from "@vsolve/api-client";
import { Badge, Button } from "@vsolve/ui";

import type { QuoteView } from "../adapters";
import type { Stage } from "../model/stages";
import { CancellationLadder } from "./cancellation-ladder";
import { useWorkspace } from "./workspace-context";

/**
 * Review — everything the customer is about to pay for, in one place.
 *
 * Doc 03 §6 lists what must appear: address, slot or Instant, scope, duration,
 * provider preference, cancellation policy and the complete quote. Every row is
 * editable, and editing jumps back to the stage that owns it rather than opening
 * a modal, so there is one place each answer can be changed.
 *
 * This is the last stage B3 implements. What follows — login, payment,
 * assignment — is modelled in the sequence but owned by B4, B5 and B6.
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
  slotLabel: string | null;
  providerLabel: string | null;
  /** Instant arrival estimate, as text. Never a countdown (ADR-030). */
  arrivalText?: string | null;
  /** True when the cart already holds items and this is an Instant booking. */
  instantSplitsFromCart?: boolean;
  /** Owned by B4/B5 — this stage only reports that it is ready. */
  onContinue?: () => void;
  continueLabel?: string;
}

export function ReviewStage({
  quote,
  service,
  addressLine,
  slotLabel,
  providerLabel,
  arrivalText,
  instantSplitsFromCart = false,
  onContinue,
  continueLabel = "Continue",
}: ReviewStageProps) {
  const { state, durationMinutes, goTo } = useWorkspace();
  const isInstant = state.fulfilment === "INSTANT";

  const rows: ReviewRow[] = [
    { label: "Address", value: addressLine ?? "Not set", stage: "address" },
    {
      label: "When",
      value: isInstant ? (arrivalText ?? "As soon as possible") : (slotLabel ?? "Not set"),
      stage: isInstant ? "type" : "slot",
    },
    {
      label: "Booked time",
      value: durationMinutes === null ? "Not set" : `${durationMinutes} minutes`,
      stage: "duration",
    },
  ];

  if (!isInstant && providerLabel !== null) {
    rows.push({ label: "Professional", value: providerLabel, stage: "provider" });
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-text">Check the details</h2>

      <div className="mt-4 rounded-card border border-line bg-surface">
        <div className="flex items-baseline justify-between gap-3 border-b border-line p-4">
          <div className="min-w-0">
            <p className="font-semibold text-text">{service.name}</p>
            {state.quantity > 1 ? (
              <p className="text-sm text-text-secondary">
                {state.quantity} in the same visit
              </p>
            ) : null}
          </div>
          <Badge tone={isInstant ? "action" : "neutral"}>
            {isInstant ? "Now" : "Scheduled"}
          </Badge>
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

      {instantSplitsFromCart ? (
        // Doc 10 §14, with the copy tasks.md B3 specifies verbatim.
        <p className="mt-4 rounded-card border border-info-line bg-info-surface p-4 text-sm text-text">
          Book this now — your other items stay in your cart.
        </p>
      ) : null}

      {isInstant ? (
        <p className="mt-4 text-sm text-text-secondary">
          You pay first, then we find your professional. If nobody is available,
          you get every rupee back.
        </p>
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
          {quote === null ? (
            <p className="mt-2 text-sm text-text-secondary">
              Waiting for your final price.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
