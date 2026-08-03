"use client";

import { Button, Dialog, ErrorState } from "@vsolve/ui";
import { useState } from "react";

import { MERGE_ACTIONS, type CartMergeConflict, type MergeAction } from "../conflicts";

/**
 * The login cart merge, decided by the customer.
 *
 * Django refuses to merge overlapping requests on its own and returns the
 * conflicting pairs. This dialog is where each pair is ruled on, and it is
 * deliberately incapable of choosing for anyone: the confirm button stays
 * disabled until every listed item has an action, and no action is preselected.
 * A default here would be exactly the silent winner the contract exists to
 * prevent — and Django would reject the omission anyway, so a defaulted UI would
 * only be able to hide a decision from the customer, never from the server.
 *
 * Two refusals arrive through the same code and are *not* decidable this way.
 * `CART_LIMIT_EXCEEDED` and `CART_VERSION_CHANGED` carry no item, so offering
 * per-item radios for them would be a control that cannot resolve anything. Each
 * gets its own honest state below.
 */

const ACTION_LABELS: Record<MergeAction, string> = {
  KEEP_CUSTOMER: "Keep the one in my account",
  KEEP_SESSION: "Keep the one I just set up",
  KEEP_BOTH: "Keep both",
};

const ACTION_HINTS: Record<MergeAction, string> = {
  KEEP_CUSTOMER: "Discards the copy from this browser session.",
  KEEP_SESSION: "Discards the copy saved to your account.",
  KEEP_BOTH: "Books the same service twice.",
};

export interface MergeDialogProps {
  conflict: CartMergeConflict | null;
  isMerging: boolean;
  /** A refusal from the merge command itself, already described for a person. */
  errorMessage: string | null;
  onConfirm: (decisions: { sessionItemId: string; action: MergeAction }[]) => void;
  onRefresh: () => void;
  onDismiss: () => void;
}

export function MergeDialog({
  conflict,
  isMerging,
  errorMessage,
  onConfirm,
  onRefresh,
  onDismiss,
}: MergeDialogProps) {
  const [decisions, setDecisions] = useState<Record<string, MergeAction>>({});

  if (conflict === null) return null;

  const decidable = conflict.duplicates.length > 0;
  const allDecided =
    decidable && conflict.duplicates.every((duplicate) => decisions[duplicate.sessionItemId]);
  const canSend =
    allDecided &&
    conflict.customerCartVersion !== null &&
    conflict.sessionCartVersion !== null;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
      title="You already had a booking started"
      description={
        decidable
          ? "Some of what you set up before logging in is already in your account. Choose what to keep — nothing is discarded until you do."
          : undefined
      }
    >
      <div className="p-5">
        {conflict.versionChanged ? (
          <ErrorState
            severity="warning"
            title="Your cart changed while we were merging"
            message="Someone — probably you, in another tab — edited this cart. Reload it and we will ask again against what is actually there."
            actionLabel="Reload my cart"
            onAction={onRefresh}
          />
        ) : null}

        {conflict.limit !== null ? (
          <ErrorState
            severity="warning"
            title="That would be too many services in one booking"
            message={
              conflict.limit.combinedItemCount !== null &&
              conflict.limit.maximumItemCount !== null
                ? `Together they come to ${conflict.limit.combinedItemCount} services and a single booking holds ${conflict.limit.maximumItemCount}. Book some of them separately.`
                : "Together they exceed what a single booking can hold. Book some of them separately."
            }
            actionLabel="Reload my cart"
            onAction={onRefresh}
          />
        ) : null}

        {decidable ? (
          <>
            <ul className="flex flex-col gap-4">
              {conflict.duplicates.map((duplicate, index) => {
                const name = `merge-${duplicate.sessionItemId}`;
                return (
                  <li key={duplicate.sessionItemId}>
                    <fieldset>
                      <legend className="text-sm font-semibold text-text">
                        {/* The server sends ids, not names, for the conflicting
                            pair. Numbering them is honest; inventing a service
                            name for an id would not be. */}
                        Duplicate request {index + 1} of {conflict.duplicates.length}
                      </legend>
                      <div className="mt-2 flex flex-col gap-2">
                        {MERGE_ACTIONS.map((action) => (
                          <label
                            key={action}
                            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-plate border border-line-strong p-3 text-sm has-[:checked]:border-action has-[:checked]:bg-signal-50"
                          >
                            <input
                              type="radio"
                              name={name}
                              value={action}
                              className="mt-1"
                              checked={decisions[duplicate.sessionItemId] === action}
                              disabled={isMerging}
                              onChange={() =>
                                setDecisions((current) => ({
                                  ...current,
                                  [duplicate.sessionItemId]: action,
                                }))
                              }
                            />
                            <span>
                              <span className="font-medium text-text">
                                {ACTION_LABELS[action]}
                              </span>
                              <span className="block text-text-secondary">
                                {ACTION_HINTS[action]}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </li>
                );
              })}
            </ul>

            {errorMessage !== null ? (
              <p className="mt-4 text-sm text-critical" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                onClick={() =>
                  onConfirm(
                    conflict.duplicates.map((duplicate) => ({
                      sessionItemId: duplicate.sessionItemId,
                      action: decisions[duplicate.sessionItemId]!,
                    })),
                  )
                }
                disabled={!canSend}
                loading={isMerging}
                loadingLabel="Merging"
              >
                Merge my bookings
              </Button>
              <Button variant="outline" onClick={onRefresh} disabled={isMerging}>
                Reload my cart
              </Button>
            </div>

            {!allDecided ? (
              <p className="mt-3 text-sm text-text-secondary" aria-live="polite">
                Choose an option for every duplicate to continue.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
