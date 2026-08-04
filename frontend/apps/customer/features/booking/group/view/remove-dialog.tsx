"use client";

import { Button, Dialog } from "@vsolve/ui";

import type { CartItem } from "../queries";

/**
 * Confirms cart-item removal before the versioned command is sent.
 *
 * Destructive and irreversible from the Customer's point of view, so it asks
 * with the service label Django already published rather than a generic "this
 * item". Escape / backdrop / Cancel dismiss without sending; Confirm is the only
 * path that calls `onConfirm`.
 *
 * ## Why the failure message is rendered in here
 *
 * `Dialog` is the native `<dialog>` element opened with `showModal()`, which
 * makes everything behind it inert: not merely visually covered, but
 * unfocusable and skipped by a screen reader. A retry prompt rendered on the
 * page underneath is therefore a control the Customer cannot reach while the
 * thing it refers to is still open. If the Customer can act on a refusal
 * without dismissing this dialog, the refusal has to be inside it.
 *
 * ## Why the item is passed rather than remembered
 *
 * The caller derives `item` from the current cart on every render, so the
 * version this dialog confirms against is the version the server last
 * published. A snapshot taken when the dialog opened would keep resending the
 * version a conflict has already rejected.
 */

export interface RemoveCartItemDialogProps {
  item: CartItem | null;
  isPending: boolean;
  /** A refusal the Customer can act on from here. Non-retryable ones close the dialog. */
  errorMessage: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function RemoveCartItemDialog({
  item,
  isPending,
  errorMessage,
  onConfirm,
  onDismiss,
}: RemoveCartItemDialogProps) {
  if (item === null) return null;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !isPending) onDismiss();
      }}
      title={`Remove ${item.service_name}?`}
      description={`${item.service_name} (${item.variant_name}) will leave this booking. Other services stay as they are.`}
      dismissable={!isPending}
      footer={
        <>
          <Button variant="outline" disabled={isPending} onClick={onDismiss}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={isPending}
            loading={isPending}
            loadingLabel={`Removing ${item.service_name}`}
            onClick={onConfirm}
          >
            {errorMessage === null ? "Remove" : "Try again"}
          </Button>
        </>
      }
    >
      <p className="sr-only" aria-live="polite">
        {isPending ? `Removing ${item.service_name}.` : null}
      </p>

      {errorMessage !== null ? (
        <p className="text-sm text-critical" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </Dialog>
  );
}
