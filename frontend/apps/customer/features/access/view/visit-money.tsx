"use client";

import type { VisitSlotRow } from "../adapters";

/**
 * What one slot's money did, in the server's own arithmetic.
 *
 * Lifted out of the tracker when the visit page landed, because both screens
 * have to say this and neither may say it differently. The list renders a
 * three-word clause of its own; this is the full sentence, and the visit page
 * is where it belongs — somebody asking "where did my money go" has already
 * chosen a row.
 *
 * **Nothing here adds anything up.** Every figure is a label the server
 * published in integer paise and formatted once in the adapter. A client that
 * can produce a number disagreeing with a refund statement eventually will.
 */

/** `M2-FE-424` — what this slot's money did, per the server's own split. */
export function SlotMoneyLine({ row }: { row: VisitSlotRow }) {
  switch (row.money.kind) {
    case "unspent":
      return (
        <p className="mt-2 text-sm text-text-secondary">
          {row.money.amountLabel} of your plan is set aside for this slot. If
          nobody takes it, that comes back to you.
        </p>
      );
    case "committed":
      return (
        <p className="mt-2 text-sm text-text-secondary">
          {row.money.amountLabel} of your plan covers this visit. It is paid to
          the professional only once they have been and sent you an estimate.
        </p>
      );
    case "earned":
      return (
        <p className="mt-2 text-sm text-text">
          {row.money.vendorPayoutLabel ?? row.money.amountLabel} of your{" "}
          {row.money.amountLabel} goes to the professional who came and wrote your
          estimate. The rest is our fee.
        </p>
      );
    case "refunded":
      return (
        <p className="mt-2 text-sm text-text">
          {row.money.amountLabel} refunded to you. Nobody is paid for a visit that
          did not deliver an estimate.
        </p>
      );
    case "replaced":
      return (
        <p className="mt-2 text-sm text-text">
          This slot is owed a replacement visit, free. Your {row.money.amountLabel}{" "}
          stays with the plan rather than being refunded.
        </p>
      );
    default:
      return null;
  }
}
