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

/**
 * The same fact in a handful of words, for the row above the sentence.
 *
 * ## Why a second rendering of one fact is safe here, and only here
 *
 * The rule this file opens with still holds: **nothing here adds anything up.**
 * Every figure below is the same server-published label `SlotMoneyLine` prints,
 * reused verbatim — the summary can be shorter than the sentence but it can
 * never be a different number, because there is no arithmetic in either.
 *
 * What the summary drops is the *explanation*, never a figure. "₹499 held" and
 * "released after the estimate" are both in the sentence underneath, one tap
 * away, and the tap is what the row exists to offer: a Customer checking where
 * their money is gets the answer in a glance, and a Customer asking why gets
 * the full account without having read it first.
 */
export function slotMoneySummary(row: VisitSlotRow): string {
  switch (row.money.kind) {
    case "unspent":
      return `${row.money.amountLabel} set aside · comes back if nobody takes it`;
    case "committed":
      return `${row.money.amountLabel} held · released after the estimate`;
    case "earned":
      return `${row.money.vendorPayoutLabel ?? row.money.amountLabel} paid to the professional`;
    case "refunded":
      return `${row.money.amountLabel} refunded to you`;
    case "replaced":
      return "A replacement visit is owed to you, free";
    default:
      // A share status this build does not recognise. The sentence below says
      // nothing for it either, and a summary that guessed would be worse than a
      // row that admits it has nothing to add.
      return "See below";
  }
}
