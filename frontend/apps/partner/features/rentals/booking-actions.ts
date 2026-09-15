/**
 * Partner booking lifecycle actions for A7 rentals.
 * Django owns transitions; this only decides which UI control to offer.
 */

export type RentalBookingStatus =
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

export type BookingAction = "handover" | "return" | "release-deposit";

/** Single primary action for a booking row, or null when none applies. */
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

export function bookingActionLabel(action: BookingAction): string {
  switch (action) {
    case "handover":
      return "Handover";
    case "return":
      return "Return";
    case "release-deposit":
      return "Release deposit";
  }
}

/** Submit for ops moderation when draft or rejected. */
export function canSubmitAsset(moderationStatus: string): boolean {
  return moderationStatus === "DRAFT" || moderationStatus === "REJECTED";
}
