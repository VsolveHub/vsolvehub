"use client";

import { Button, Card } from "@vsolve/ui";

import type { PreCheckView } from "../adapters";

/**
 * The Instant eligible-pool pre-check result — **Instant only**.
 *
 * Doc 11 §2 step 6: this exists so the platform never asks a customer to pay
 * into a search it already knows is empty. It reserves nothing and holds
 * nothing, so this screen must not imply that anyone has been secured. The copy
 * says a professional is *available*, never that one is *assigned* — assignment
 * happens after payment (B6) and claiming it here would be the exact
 * "order placed, then no provider" pattern doc 03 §8 forbids.
 *
 * On refusal the reassurance is shown because every outcome here is
 * pre-payment. The same sentence after payment would be a lie; see the trust
 * rule in `adapters/precheck.ts`.
 */

export interface PreCheckStageProps {
  result: PreCheckView;
  onSwitchToScheduled: () => void;
  onChangeAddress: () => void;
  onRetry: () => void;
}

export function PreCheckStage({
  result,
  onSwitchToScheduled,
  onChangeAddress,
  onRetry,
}: PreCheckStageProps) {
  if (result.canDispatch) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-text">{result.headline}</h2>
        {result.arrivalText ? (
          <p className="mt-2 text-text-secondary">
            {/* Text, never a countdown or a map — ADR-013/ADR-030. */}
            {result.arrivalText}
          </p>
        ) : null}
        <p className="mt-4 text-sm text-text-secondary">
          We confirm who is coming after payment. If nobody confirms, you get a
          full refund.
        </p>
      </Card>
    );
  }

  const action =
    result.primaryAction === "change_address"
      ? { label: "Change address", onClick: onChangeAddress }
      : result.primaryAction === "retry"
        ? { label: "Check again", onClick: onRetry }
        : { label: "Pick a time instead", onClick: onSwitchToScheduled };

  return (
    <Card>
      <h2 className="text-lg font-semibold text-text">{result.headline}</h2>

      {result.detail ? <p className="mt-2 text-text-secondary">{result.detail}</p> : null}

      {result.reassurance ? (
        <p className="mt-2 font-medium text-text">{result.reassurance}</p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={action.onClick}>{action.label}</Button>
        {result.primaryAction !== "switch_to_scheduled" ? (
          <Button variant="secondary" onClick={onSwitchToScheduled}>
            Pick a time instead
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
