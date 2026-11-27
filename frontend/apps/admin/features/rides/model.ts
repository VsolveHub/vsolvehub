/** Plain words for the ride states, the filters, and what Operations may do (brief §5.4). */

/** `RETURNING` is a parcel going back to the pickup: still open, so Operations can still end it. */
export const OPEN_STATES = ["SEARCHING", "CAPTAIN_ASSIGNED", "CAPTAIN_ARRIVED", "IN_TRIP", "RETURNING"] as const;

export const STATE_LABEL: Record<string, string> = {
  SEARCHING: "Searching",
  CAPTAIN_ASSIGNED: "Captain on the way",
  CAPTAIN_ARRIVED: "Captain at pickup",
  IN_TRIP: "In trip",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_CAPTAIN_FOUND: "No captain found",
  RETURNING: "Returning",
  RETURNED: "Returned",
};

export type StateTone = "info" | "success" | "warning" | "neutral";

export function stateTone(state: string): StateTone {
  if (isOpen(state)) return "info";
  if (state === "COMPLETED") return "success";
  if (state === "NO_CAPTAIN_FOUND") return "warning";
  return "neutral";
}

/** A parcel that finished is "Delivered", where a ride is "Completed". */
export function stateLabel(state: string, kind: string = "RIDE"): string {
  if (kind === "PARCEL" && state === "COMPLETED") return "Delivered";
  return STATE_LABEL[state] ?? state;
}

export function isOpen(state: string): boolean {
  return (OPEN_STATES as readonly string[]).includes(state);
}

/** Operations can close any open ride, even one in trip; never a finished one (brief §5.4). */
export const canForceCancel = isOpen;

/**
 * The list filters: each the comma-separated `?state=` the server takes. "Unpaid" is different: it
 * looks at every state for a parcel whose sender did not pay, for Operations to follow up (§7.1).
 */
export interface RideFilter {
  key: "live" | "completed" | "cancelled" | "no-captain" | "unpaid";
  label: string;
  states: string;
  paymentStatus?: "UNPAID";
}

export const RIDE_FILTERS: readonly RideFilter[] = [
  { key: "live", label: "Live", states: OPEN_STATES.join(",") },
  { key: "completed", label: "Completed", states: "COMPLETED" },
  { key: "cancelled", label: "Cancelled", states: "CANCELLED" },
  { key: "no-captain", label: "No captain", states: "NO_CAPTAIN_FOUND" },
  { key: "unpaid", label: "Unpaid", states: "", paymentStatus: "UNPAID" },
];

export type RideFilterKey = RideFilter["key"];

/** The Kind filter on the rides list (§7.1): everything, rides, or Pick up & Drop parcels. */
export const KIND_FILTERS = [
  { key: "all", label: "All", kind: "" },
  { key: "rides", label: "Rides", kind: "RIDE" },
  { key: "parcels", label: "Pick up & Drop", kind: "PARCEL" },
] as const;

export type KindFilterKey = (typeof KIND_FILTERS)[number]["key"];

export const KIND_LABEL: Record<string, string> = { RIDE: "Ride", PARCEL: "Pick up & Drop" };

export function kindLabel(kind: string | undefined): string {
  return KIND_LABEL[kind ?? "RIDE"] ?? "Ride";
}

/** What Operations reads for a payment: a parcel can also be "Not paid", to follow up (D14). */
export function paymentText(status: string): string {
  if (status === "COLLECTED") return "Collected by captain";
  if (status === "UNPAID") return "Not paid: follow up";
  return "Due";
}

export const MODE_LABEL: Record<string, string> = { SEND: "Sending", RECEIVE: "Receiving" };
export const PAYER_LABEL: Record<string, string> = {
  SENDER: "Sender pays, at the pickup",
  RECEIVER: "Receiver pays, at the drop",
};
export const MEET_LABEL: Record<string, string> = { CURB: "Meet at curb", DOOR: "Meet at door" };

/** The most wrong delivery PINs allowed before it locks (D12). */
export const PIN_MAX_ATTEMPTS = 5;

/** The force-cancel reason the server accepts: required, at most 64 characters. */
export const CANCEL_REASON_MAX = 64;

export function cancelReasonError(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return "Say why you are cancelling.";
  if (trimmed.length > CANCEL_REASON_MAX) return `Keep it under ${CANCEL_REASON_MAX} characters.`;
  return null;
}

export const ACTOR_LABEL: Record<string, string> = {
  RIDER: "Rider",
  CAPTAIN: "Captain",
  OPERATIONS: "Operations",
  SYSTEM: "System",
};

export const OFFER_LABEL: Record<string, string> = {
  PENDING: "Waiting",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "No answer",
  WITHDRAWN: "Withdrawn",
};

/** "1.2 km" or "350 m". */
export function distanceText(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;
}

/** A Google Maps link for where an SOS was raised, or null when the phone sent no place. */
export function mapLink(latitude: string | null, longitude: string | null): string | null {
  if (latitude == null || longitude == null) return null;
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

// --- rate cards and pass plans -------------------------------------------------------------

export type RateKey =
  | "base_fare_paise"
  | "included_distance_m"
  | "per_km_paise"
  | "per_minute_paise"
  | "minimum_fare_paise"
  | "free_waiting_minutes"
  | "waiting_per_minute_paise";

/** The seven numbers of a rate card, typed by Operations in rupees, metres and minutes. */
export const RATE_FIELDS: readonly { key: RateKey; label: string; unit: "rupees" | "metres" | "minutes" }[] = [
  { key: "base_fare_paise", label: "Base fare (₹)", unit: "rupees" },
  { key: "included_distance_m", label: "Distance in base fare (m)", unit: "metres" },
  { key: "per_km_paise", label: "Per km after that (₹)", unit: "rupees" },
  { key: "per_minute_paise", label: "Per minute (₹)", unit: "rupees" },
  { key: "minimum_fare_paise", label: "Minimum fare (₹)", unit: "rupees" },
  { key: "free_waiting_minutes", label: "Free waiting (min)", unit: "minutes" },
  { key: "waiting_per_minute_paise", label: "Waiting per minute after that (₹)", unit: "rupees" },
];

export type RateForm = Record<RateKey, string>;
export type Rates = Record<RateKey, number>;

/** What the server stores (paise, metres, minutes) as the text in a form box. */
export function toInput(value: number, unit: "rupees" | "metres" | "minutes"): string {
  return unit === "rupees" ? (value / 100).toString() : value.toString();
}

/** The box's text as what the server stores, or null when it is not a valid, non-negative number. */
export function fromInput(raw: string, unit: "rupees" | "metres" | "minutes"): number | null {
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return null;
  if (unit === "rupees") return Math.round(value * 100);
  return Number.isInteger(value) ? value : null;
}

export function rateForm(card: Rates | null): RateForm {
  return Object.fromEntries(RATE_FIELDS.map(({ key, unit }) => [key, card ? toInput(card[key], unit) : ""])) as RateForm;
}

/** Every number read from the form, or the label of the first box that is wrong. */
export function readRates(form: RateForm): { rates: Rates } | { error: string } {
  const rates: Partial<Rates> = {};
  for (const { key, label, unit } of RATE_FIELDS) {
    const value = fromInput(form[key], unit);
    if (value === null) return { error: `Check “${label}”: a number, 0 or more${unit === "rupees" ? "" : ", whole"}.` };
    rates[key] = value;
  }
  return { rates: rates as Rates };
}

/** Only what changed, since an edit saves a new version (the server refuses an empty edit). */
export function changedRates(card: Rates, rates: Rates): Partial<Rates> {
  return Object.fromEntries(RATE_FIELDS.filter(({ key }) => card[key] !== rates[key]).map(({ key }) => [key, rates[key]]));
}

/** The areas Operations can add a card for: those that already have one (areas come from the seed in V1). */
export function areasOf(cards: readonly { service_area_id: string; service_area_name: string }[]) {
  const seen = new Map<string, string>();
  for (const card of cards) seen.set(card.service_area_id, card.service_area_name);
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The server's vehicle codes: a cab is `CAB` (it was typed `CAR` here, which the server refuses). */
export const VEHICLE_TYPES = [
  { code: "BIKE", label: "Bike" },
  { code: "AUTO", label: "Auto" },
  { code: "CAB", label: "Cab" },
] as const;

/** What a card is for: rides, or Pick up & Drop parcels (§7.3). */
export const RATE_KINDS = [
  { code: "RIDE", label: "Ride" },
  { code: "PARCEL", label: "Pick up & Drop" },
] as const;

/** A parcel card exists only for these (D2): there are no cab parcels. */
export const PARCEL_VEHICLES = ["BIKE", "AUTO"] as const;

/**
 * The limits Operations starts a new parcel card with (D5). Only a starting point: the saved card
 * is what customers see, and Operations changes it per area.
 */
export const PARCEL_DEFAULTS: Record<string, { weightKg: string; size: string }> = {
  BIKE: { weightKg: "10", size: "40 x 30 x 20 cm" },
  AUTO: { weightKg: "50", size: "1.3 x 3.5 x 3.3 ft" },
};

/** The server keeps the size label to this many characters. */
export const SIZE_LABEL_MAX = 40;

export interface ParcelLimits {
  max_parcel_weight_grams: number;
  parcel_size_label: string;
}

/** Kilograms typed in a box as the grams the server stores, or null when not a positive number. */
export function kgToGrams(raw: string): number | null {
  const value = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(value) || value <= 0) return null;
  const grams = Math.round(value * 1000);
  return grams > 0 ? grams : null;
}

/** Grams from the server as the text of the kilograms box ("10", "7.5"). */
export function gramsToKg(grams: number): string {
  return (grams / 1000).toString();
}

/** The weight and size boxes as the limits to save, or what is wrong with them. */
export function readParcelLimits(weightKg: string, size: string): { limits: ParcelLimits } | { error: string } {
  const grams = kgToGrams(weightKg);
  if (grams === null) return { error: "Check “Max weight (kg)”: a number above 0." };
  const label = size.trim();
  if (!label) return { error: "Check “Size”: say what size fits, for example 40 x 30 x 20 cm." };
  if (label.length > SIZE_LABEL_MAX) return { error: `Check “Size”: up to ${SIZE_LABEL_MAX} characters.` };
  return { limits: { max_parcel_weight_grams: grams, parcel_size_label: label } };
}

/** Only the limits that changed, since an edit saves a new version. */
export function changedParcelLimits(
  card: { max_parcel_weight_grams: number | null; parcel_size_label: string },
  limits: ParcelLimits,
): Partial<ParcelLimits> {
  const changed: Partial<ParcelLimits> = {};
  if (card.max_parcel_weight_grams !== limits.max_parcel_weight_grams) {
    changed.max_parcel_weight_grams = limits.max_parcel_weight_grams;
  }
  if (card.parcel_size_label !== limits.parcel_size_label) changed.parcel_size_label = limits.parcel_size_label;
  return changed;
}

/** "up to 10 kg · 40 x 30 x 20 cm", for a parcel card in the list. */
export function limitsText(card: { max_parcel_weight_grams: number | null; parcel_size_label: string }): string {
  if (card.max_parcel_weight_grams === null) return "";
  return `up to ${gramsToKg(card.max_parcel_weight_grams)} kg · ${card.parcel_size_label}`;
}

/** "24 h", or "3 days" when it is whole days. */
export function durationText(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) return hours === 24 ? "1 day" : `${hours / 24} days`;
  return `${hours} h`;
}
