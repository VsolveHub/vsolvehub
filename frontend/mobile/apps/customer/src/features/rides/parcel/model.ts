// Pick up & Drop, customer side (docs/parcel/README.md §5). Pure rules: no network, no screens.
// Every price shown comes from the server; nothing here works one out.
import type { Schemas } from "@vsolve/api-client";

export type ParcelMode = "SEND" | "RECEIVE";
export type Payer = "SENDER" | "RECEIVER";
export type MeetAt = "CURB" | "DOOR";
export type Side = "pickup" | "drop";

/** One end of the parcel, as typed on the details screen (D8). */
export interface ParcelEnd {
  name: string;
  /** The 10 digits, without +91. */
  phone: string;
  building: string;
  unit: string;
  meet_at: MeetAt;
  instructions: string;
}

/** Everything the Review screen collects before Confirm. */
export interface ParcelDraft {
  mode: ParcelMode;
  payer: Payer;
  /** Once the booker has chosen who pays, sending or receiving no longer changes it (D9). */
  payerChosen: boolean;
  /** "PIN confirmation": on by default for security, the booker may turn it off (D10). */
  pinRequired: boolean;
  pickup: ParcelEnd;
  drop: ParcelEnd;
}

/** The booker's own name and phone, from their account. */
export interface Booker {
  name: string;
  phone: string;
}

/** A pickup defaults to meeting at the curb and a drop at the door, as in the reference (§5.1). */
export function emptyEnd(side: Side): ParcelEnd {
  return { name: "", phone: "", building: "", unit: "", meet_at: side === "pickup" ? "CURB" : "DOOR", instructions: "" };
}

/** The last 10 digits of a phone number like "+91 98765 43210". */
export function tenDigits(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

/** The booker's own end: their account name and phone, editable on the details screen (D7). */
function ownEnd(side: Side, booker: Booker): ParcelEnd {
  return { ...emptyEnd(side), name: booker.name.trim(), phone: tenDigits(booker.phone) };
}

function isBlank(end: ParcelEnd): boolean {
  return end.name.trim() === "" && end.phone.trim() === "";
}

/** Whether this end is still just the booker's account details, never edited. */
function isUntouchedOwn(end: ParcelEnd, booker: Booker): boolean {
  return (
    end.name.trim() === booker.name.trim() &&
    end.phone === tenDigits(booker.phone) &&
    end.building === "" &&
    end.unit === "" &&
    end.instructions === ""
  );
}

function payerFor(mode: ParcelMode): Payer {
  return mode === "SEND" ? "SENDER" : "RECEIVER";
}

/** Sending, the Sender pays, PIN confirmation on, and the booker at the pickup (D7, D9, D10). */
export function initialDraft(booker: Booker): ParcelDraft {
  return {
    mode: "SEND",
    payer: "SENDER",
    payerChosen: false,
    pinRequired: true,
    pickup: ownEnd("pickup", booker),
    drop: emptyEnd("drop"),
  };
}

/**
 * I'm sending / I'm receiving. The booker's own details move to their end, and the other end must
 * be added. Who pays follows the choice until the booker has switched it themselves (D9).
 */
export function withMode(draft: ParcelDraft, mode: ParcelMode, booker: Booker): ParcelDraft {
  if (draft.mode === mode) return draft;
  const own: Side = mode === "SEND" ? "pickup" : "drop";
  const other: Side = own === "pickup" ? "drop" : "pickup";
  const next: ParcelDraft = { ...draft, mode };
  if (isUntouchedOwn(draft[other], booker)) next[other] = emptyEnd(other);
  if (isBlank(next[own])) next[own] = ownEnd(own, booker);
  if (!draft.payerChosen) next.payer = payerFor(mode);
  return next;
}

/** The booker chose who pays: from now on the toggle above no longer changes it. */
export function withPayer(draft: ParcelDraft, payer: Payer): ParcelDraft {
  return { ...draft, payer, payerChosen: true };
}

export function withPinRequired(draft: ParcelDraft, pinRequired: boolean): ParcelDraft {
  return { ...draft, pinRequired };
}

export function withEnd(draft: ParcelDraft, side: Side, end: ParcelEnd): ParcelDraft {
  return { ...draft, [side]: end };
}

/** A name and a 10-digit Indian mobile number, which is what the server insists on (§4.2). */
export function isPhoneValid(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

export function isEndComplete(end: ParcelEnd): boolean {
  return end.name.trim() !== "" && isPhoneValid(end.phone);
}

/** Confirm works only when both ends have a name and a phone (D8). */
export function canConfirm(draft: ParcelDraft): boolean {
  return isEndComplete(draft.pickup) && isEndComplete(draft.drop);
}

/** The body of the booking: the draft with every text trimmed. */
export function toRequest(draft: ParcelDraft): Schemas["ParcelRequestRequest"] {
  const end = (value: ParcelEnd): Schemas["ParcelEndRequest"] => ({
    name: value.name.trim(),
    phone: value.phone,
    building: value.building.trim(),
    unit: value.unit.trim(),
    meet_at: value.meet_at,
    instructions: value.instructions.trim(),
  });
  return {
    mode: draft.mode,
    payer: draft.payer,
    pin_required: draft.pinRequired,
    pickup: end(draft.pickup),
    drop: end(draft.drop),
  };
}

/** The line under Who pays?, with the fare the server priced (§5.2, item 4). */
export function payerLine(payer: Payer, fare: string): string {
  return payer === "SENDER"
    ? `Sender pays ${fare} in cash or UPI to the captain at the pickup`
    : `Receiver pays ${fare} in cash or UPI to the captain at the drop`;
}

/** "Up to 10 kg · 40 x 30 x 20 cm": the limits are the server's, shown as the server sends them. */
export function limitsText(limits: { max_weight_grams: number | null; size_label: string }): string {
  if (limits.max_weight_grams === null) return limits.size_label;
  const kg = limits.max_weight_grams / 1000;
  const weight = Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
  return `Up to ${weight} kg · ${limits.size_label}`;
}

/** Every vehicle's limits on one line each, for the Review screen's package guidelines. */
export function guidelineLimits(
  quotes: readonly { vehicle_type: string; max_weight_grams: number | null; size_label: string }[],
  name: (type: string) => string,
): string[] {
  return quotes.map((quote) => `${name(quote.vehicle_type)}: ${limitsText(quote)}`);
}

export function meetLabel(meetAt: string): string {
  return meetAt === "DOOR" ? "Meet at door" : "Meet at curb";
}

/** The building and unit on one line, leaving out whichever is blank. */
export function placeLine(end: Pick<ParcelEnd, "building" | "unit">): string {
  return [end.building.trim(), end.unit.trim()].filter(Boolean).join(" · ");
}

// --- Tracking -------------------------------------------------------------------------------

/** What the booker's ride screen needs from the ride (`Ride`). */
export interface ParcelRideLike {
  state: string;
  otp: string | null;
  fare_paise: number;
  final_fare_paise: number | null;
  captain: { name: string; vehicle: { registration_number: string; make_model: string } } | null;
  parcel: {
    payer: string;
    arrived_at_drop_at: string | null;
    delivery_pin: string | null;
  } | null;
}

/** The stage names of the tracking screen (§5.2, item 6). */
export function parcelStageLabel(ride: Pick<ParcelRideLike, "state" | "parcel">): string {
  switch (ride.state) {
    case "SEARCHING":
      return "Finding a captain";
    case "CAPTAIN_ASSIGNED":
      return "Captain on the way";
    case "CAPTAIN_ARRIVED":
      return "At pickup";
    case "IN_TRIP":
      return ride.parcel?.arrived_at_drop_at ? "At drop" : "Picked up";
    case "COMPLETED":
      return "Delivered";
    case "RETURNING":
      return "Returning";
    case "RETURNED":
      return "Returned";
    case "NO_CAPTAIN_FOUND":
      return "No captain found";
    default:
      return "Cancelled";
  }
}

export interface ShareableCode {
  /** "pickup" or "pin": a stable key for the list. */
  key: "pickup" | "pin";
  title: string;
  /** Who the code is for: it is given to someone else (D10). */
  forWhom: string;
  code: string;
  shareText: string;
}

/** The first part of every Share text: who is coming (§5.2, item 6). */
function whoIsComing(ride: ParcelRideLike): string {
  const captain = ride.captain;
  if (!captain) return "V Solve Hub Pick up & Drop";
  const { vehicle } = captain;
  return `V Solve Hub Pick up & Drop: ${captain.name}, ${vehicle.make_model} ${vehicle.registration_number}`;
}

/**
 * The codes the booker can hand on, each with the text Share sends. The pickup code is shown while
 * the captain is coming and again on the way back; the delivery PIN only when PIN confirmation is
 * on. The server decides when each exists, so a missing one is simply not listed (§3.2).
 * `money` is the fare as the server sent it, already formatted, for the Receiver's payment line.
 */
export function shareableCodes(ride: ParcelRideLike, money: string): ShareableCode[] {
  const codes: ShareableCode[] = [];
  const who = whoIsComing(ride);
  if (ride.otp) {
    codes.push({
      key: "pickup",
      title: "Pickup code",
      forWhom: ride.state === "RETURNING" ? "For the person at the pickup, to take the parcel back" : "For the person at the pickup",
      code: ride.otp,
      shareText: `${who}. Pickup code ${ride.otp}`,
    });
  }
  const pin = ride.parcel?.delivery_pin;
  if (pin) {
    const base = `${who}. Delivery PIN ${pin}`;
    // When the Receiver pays, the drop end is also told to pay before taking the item.
    const pay = ` Please pay ${money} in cash or UPI to the captain before you take the item.`;
    codes.push({
      key: "pin",
      title: "Delivery PIN",
      forWhom: "For the receiver, to take the parcel",
      code: pin,
      shareText: ride.parcel?.payer === "RECEIVER" ? `${base}.${pay}` : base,
    });
  }
  return codes;
}

/** What the tracking screen says for the parcel's state, and a line under it (§5.2, item 6). */
export function parcelCopy(
  ride: {
    state: string;
    cancelled_by: string;
    cancel_reason: string;
    searching_again: boolean;
    parcel: { arrived_at_drop_at: string | null } | null;
  },
  captainName: string,
): { headline: string; detail: string | null } {
  switch (ride.state) {
    case "SEARCHING":
      return ride.searching_again
        ? { headline: "Finding another captain…", detail: "Your captain had to cancel. We're finding you another one." }
        : { headline: "Finding your captain…", detail: null };
    case "NO_CAPTAIN_FOUND":
      return { headline: "No captain nearby", detail: "Every captain near you is busy right now." };
    case "CAPTAIN_ASSIGNED":
      return { headline: `${captainName} is on the way`, detail: "Give the pickup code to your captain when you meet." };
    case "CAPTAIN_ARRIVED":
      return { headline: `${captainName} has arrived`, detail: "Meet your captain at the pickup and give the pickup code." };
    case "IN_TRIP":
      return ride.parcel?.arrived_at_drop_at
        ? { headline: "Your parcel is at the drop", detail: null }
        : { headline: "Your parcel is on its way", detail: null };
    case "COMPLETED":
      return { headline: "Parcel delivered", detail: "Thanks for using Pick up & Drop." };
    case "RETURNING":
      return {
        headline: "Your parcel is coming back",
        detail: "The receiver wasn't available. Give the pickup code to take it back.",
      };
    case "RETURNED":
      return { headline: "Parcel returned", detail: "Your parcel is back at the pickup." };
    default:
      if (ride.cancel_reason === "ITEM_NOT_ALLOWED") {
        return {
          headline: "Parcel not taken",
          detail: "Your captain couldn't take this item because it doesn't follow the package guidelines. You were not charged.",
        };
      }
      return {
        headline: "Pick up & Drop cancelled",
        detail:
          ride.cancelled_by === "RIDER"
            ? "You cancelled this parcel."
            : ride.cancelled_by === "OPERATIONS"
              ? "VSolve support cancelled this parcel."
              : "This parcel was cancelled.",
      };
  }
}

/** Where the Rider's money goes, in words, for the trip summary (D9). */
export function paymentNote(payer: string): string {
  return payer === "RECEIVER" ? "Receiver pays the captain at the drop" : "Sender pays the captain at the pickup";
}
