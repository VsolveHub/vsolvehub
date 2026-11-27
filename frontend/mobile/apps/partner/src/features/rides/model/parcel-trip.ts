// Pick up & Drop, captain side (docs/parcel/README.md §6). Pure functions: the server's state in,
// the screen to show out. No money is worked out here: every amount is a number the server sent.

interface ParcelBlock {
  payer: string;
  pin_required: boolean;
  arrived_at_drop_at: string | null;
  return_fare_paise: number | null;
  return_payment_status: string | null;
}

/** What these functions read from the captain's ride (`CaptainRide`). */
export interface ParcelRideLike {
  state: string;
  payment_status: string;
  fare_paise: number;
  final_fare_paise: number | null;
  parcel: ParcelBlock | null;
}

/**
 * Where the captain is in a parcel job (brief §6.3):
 * to the pickup → the pickup code (or can't take it) → collect from the sender → to the drop →
 * collect from the receiver first → hand over (PIN or Delivered); or, when the receiver is not
 * there: back to the pickup → collect from the sender, paid or not paid.
 */
export type ParcelStep =
  | "to_pickup"
  | "pickup_code"
  | "collect_sender"
  | "to_drop"
  | "collect_receiver"
  | "hand_over"
  | "returning"
  | "done";

const DUE = "DUE";

function fareDue(ride: ParcelRideLike): boolean {
  return ride.payment_status === DUE;
}

function returnDue(ride: ParcelRideLike): boolean {
  return ride.parcel?.return_payment_status === DUE;
}

/**
 * Which parcel screen the captain sees. `collectLater` is the captain's own choice to carry on to
 * the drop without collecting at the pickup: the server allows it, and the parcel stays on their
 * screen until it is paid.
 */
export function parcelStep(ride: ParcelRideLike, collectLater = false): ParcelStep {
  const parcel = ride.parcel;
  if (parcel === null) return "done";
  switch (ride.state) {
    case "CAPTAIN_ASSIGNED":
      return "to_pickup";
    case "CAPTAIN_ARRIVED":
      return "pickup_code";
    case "IN_TRIP":
      if (parcel.arrived_at_drop_at === null) {
        const senderOwes = parcel.payer === "SENDER" && fareDue(ride);
        return senderOwes && !collectLater ? "collect_sender" : "to_drop";
      }
      return parcel.payer === "RECEIVER" && fareDue(ride) ? "collect_receiver" : "hand_over";
    case "RETURNING":
      return "returning";
    case "COMPLETED":
      // Delivered, but the Sender's fare was not collected yet.
      return fareDue(ride) ? "collect_sender" : "done";
    case "RETURNED":
      return fareDue(ride) || returnDue(ride) ? "collect_sender" : "done";
    default:
      return "done";
  }
}

/**
 * The amount to collect on this screen, in paise, always a number the server sent. When the
 * parcel is back, what is still due is the whole job (`final_fare_paise` includes the return
 * leg), or only the return leg when the fare was already collected at the pickup.
 */
export function amountToCollect(ride: ParcelRideLike): number {
  const total = ride.final_fare_paise ?? ride.fare_paise;
  if (ride.state === "RETURNED" && returnDue(ride) && !fareDue(ride)) {
    return ride.parcel?.return_fare_paise ?? total;
  }
  return total;
}

/** What the collected money is for, in the words the captain says out loud. */
export function collectReason(ride: ParcelRideLike): string {
  if (ride.state !== "RETURNED") return "Cash or UPI to you";
  return fareDue(ride) ? "The parcel fare and the return trip" : "The return trip";
}

/** Whether the captain can say the sender did not pay: only once the parcel is back (D14). */
export function canMarkNotPaid(ride: ParcelRideLike): boolean {
  return ride.state === "RETURNED";
}

/** Whether the hand-over screen needs the receiver's PIN, or just a Delivered tap. */
export function needsDeliveryPin(ride: ParcelRideLike): boolean {
  return ride.parcel?.pin_required === true;
}

const FORWARD = ["Pickup", "Code", "Drop", "Hand over", "Done"] as const;
const BACK = ["Pickup", "Code", "Return", "Payment", "Done"] as const;

/** The labels of the progress bar and the one to highlight, for the way out or the way back. */
export function parcelProgress(
  ride: ParcelRideLike,
  step: ParcelStep,
): { labels: readonly string[]; at: number } {
  if (step === "done") return { labels: ride.state === "RETURNED" ? BACK : FORWARD, at: 4 };
  if (step === "returning") return { labels: BACK, at: 2 };
  if (step === "collect_sender" && ride.state === "RETURNED") return { labels: BACK, at: 3 };
  if (step === "to_pickup") return { labels: FORWARD, at: 0 };
  if (step === "pickup_code") return { labels: FORWARD, at: 1 };
  if (step === "hand_over" || step === "collect_receiver") return { labels: FORWARD, at: 3 };
  return { labels: FORWARD, at: 2 };
}

/** A phone number for the dialler: the server keeps the 10 digits, India's code is added here. */
export function callUrl(phone: string): string {
  return `tel:+91${phone}`;
}

/** "Meet at curb" or "Meet at door", from the server's code. */
export function meetText(meetAt: string): string {
  return meetAt === "DOOR" ? "Meet at door" : "Meet at curb";
}

/** The building and the unit on one line, leaving out whichever is blank. */
export function buildingLine(end: { building: string; unit: string }): string {
  return [end.building.trim(), end.unit.trim()].filter(Boolean).join(" · ");
}

/** A typed delivery PIN is four digits, like the pickup code. */
export function isPinComplete(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/** What the captain sees on the offer card about where the money is collected (D9). */
export function collectAtText(paymentPoint: string): string {
  return paymentPoint === "DROP" ? "Collect at drop" : "Collect at pickup";
}

/** The label for a parcel's state in lists: the two new states, and Delivered for COMPLETED. */
export function parcelStateLabel(state: string): string | null {
  if (state === "COMPLETED") return "Delivered";
  if (state === "RETURNING") return "Returning";
  if (state === "RETURNED") return "Returned";
  return null;
}
