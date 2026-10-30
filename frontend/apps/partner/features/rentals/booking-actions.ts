import type { useT } from "@vsolve/ui";

/**
 * Partner booking lifecycle actions for A7 rentals.
 * Django owns transitions; this only decides which UI control to offer.
 */

export type RentalBookingStatus =
  | "AWAITING_TRANSPORT_QUOTE"
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "HANDOVER"
  | "RETURNED"
  | "CANCELLED"
  | "DISPUTED"
  | string;

export type DepositStatus =
  | "REQUESTED"
  | "AUTHORIZED"
  | "HELD"
  | "RELEASED"
  | "PARTIALLY_CONSUMED"
  | "FULLY_CONSUMED"
  | string;

export type BookingAction =
  | "handover"
  | "return"
  | "release-deposit"
  | "dispute-deposit"
  | "cancel";

/** Primary + optional secondary actions for a booking row. */
export function partnerBookingAction(
  status: RentalBookingStatus,
  depositStatus?: DepositStatus | null,
): BookingAction | null {
  if (status === "CONFIRMED") return "handover";
  if (status === "HANDOVER") return "return";
  if (status === "RETURNED") {
    if (depositStatus === "HELD" || depositStatus === "AUTHORIZED") {
      return "release-deposit";
    }
    return null;
  }
  return null;
}

/** Pre-handover cancel: a delivery request, PENDING_PAYMENT or CONFIRMED only. */
export function canCancelBooking(status: RentalBookingStatus): boolean {
  return status === "AWAITING_TRANSPORT_QUOTE" || status === "PENDING_PAYMENT" || status === "CONFIRMED";
}

/** After return with held deposit, partner may raise a dispute instead of full release. */
export function canDisputeDeposit(
  status: RentalBookingStatus,
  depositStatus?: DepositStatus | null,
): boolean {
  return (
    status === "RETURNED" &&
    (depositStatus === "HELD" || depositStatus === "AUTHORIZED")
  );
}

export function bookingActionLabel(action: BookingAction, t: ReturnType<typeof useT>): string {
  switch (action) {
    case "handover":
      return t("rentals.action.handover");
    case "return":
      return t("rentals.action.return");
    case "release-deposit":
      return t("rentals.action.releaseDeposit");
    case "dispute-deposit":
      return t("rentals.action.disputeDeposit");
    case "cancel":
      return t("rentals.action.cancel");
  }
}

/** Submit for ops moderation when draft or rejected. */
export function canSubmitAsset(moderationStatus: string): boolean {
  return moderationStatus === "DRAFT" || moderationStatus === "REJECTED";
}
