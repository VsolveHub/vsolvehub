"use client";

import { Button, Dialog } from "@vsolve/ui";

/**
 * The one refusal adding a service can still produce.
 *
 * This file used to hold the singleton replacement prompt: "you already have
 * another service set up, continuing will discard it". That question no longer
 * exists, because a different service is now a second cart item and nothing is
 * discarded to make room for it.
 *
 * What Django still refuses is an *identical* request — same variant, same scope
 * answers — with `duplicate_cart_item` and the published recovery
 * `update_existing_item`. So the dialog survives with the same shape and the
 * opposite meaning: it destroys nothing, and its primary action takes the
 * customer to the item they already have rather than creating a second copy of
 * it.
 */

export interface DuplicateItemDialogProps {
  isOpen: boolean;
  /** What the customer just tried to add. */
  serviceName: string;
  onViewBooking: () => void;
  onDismiss: () => void;
}

export function DuplicateItemDialog({
  isOpen,
  serviceName,
  onViewBooking,
  onDismiss,
}: DuplicateItemDialogProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
      title="This is already in your booking"
    >
      <div className="p-5">
        <p className="text-sm leading-6 text-text">
          <strong className="font-semibold">{serviceName}</strong> is already there with
          exactly these answers. Nothing has changed.
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          If you need it done more than once, change the quantity on the one you already
          have.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={onViewBooking}>Go to my booking</Button>
          <Button variant="outline" onClick={onDismiss}>
            Change my answers
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
