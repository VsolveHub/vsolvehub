import { OPTIONAL_DETAILS, type OptionalDetail } from "./screens";

/**
 * The four optional extras, as values rather than as screens.
 *
 * `FLOW-02` is the whole reason this file exists. Callback preference,
 * site-visit interest, access constraints and preferred communication were each
 * a *step* in the pre-audit design — four screens every Customer walked through
 * to serve the minority who wanted any of them, turning a four-screen flow into
 * an eight-screen one. `M2-FE-207` moves them to optional entry points reachable
 * **from** review.
 *
 * `screens.ts` already records that they are not sequenced. This file records
 * what they actually hold, because "reachable from review" was implemented as
 * four buttons with nothing behind them, and an entry point to an empty room is
 * not an option a Customer has.
 *
 * ## Why the shapes live in the client
 *
 * Unlike screen 1's questions, these are not catalogue configuration. They are
 * the same four things for every category, so there is no server schema to
 * render from — proposal 0012 has no field for them at all, which is logged as a
 * contract gap in the execution plan §7. When the wire shape lands they are
 * mapped in `../adapters/`, exactly like everything else here.
 *
 * ## They are stored, not sent separately
 *
 * Every value below travels with the requirement's own save. There is no
 * per-panel save button and no per-panel request, so there is no per-panel
 * pending or error state to invent: the review screen's submit is the one place
 * this can fail, and it already says so.
 */

/* --------------------------------------------------------------------------
   Value shapes
   -------------------------------------------------------------------------- */

/**
 * When a Customer is willing to take a call.
 *
 * Windows rather than a time, because the promise a support desk can keep is
 * "some time this morning" and offering "10:15" would be a promise nobody made.
 */
export type CallbackWindow = "MORNING" | "AFTERNOON" | "EVENING" | "ANY";

export interface CallbackPreference {
  requested: boolean;
  window: CallbackWindow;
}

export interface SiteVisitInterest {
  requested: boolean;
  /** What a visitor would need to see. Optional. */
  note: string;
}

/**
 * The things that make a job harder to reach, as codes.
 *
 * A closed list rather than free text alone, because these are what a vendor
 * prices differently — four flights of stairs with no lift is labour, not
 * trivia — and a sentence buried in a paragraph does not reach the pricing.
 * The note stays for everything the list does not cover.
 */
export type AccessConstraint =
  | "NO_LIFT"
  | "NO_PARKING"
  | "ENTRY_PERMISSION"
  | "RESTRICTED_HOURS"
  | "PETS_ON_SITE";

export const ACCESS_CONSTRAINTS = [
  "NO_LIFT",
  "NO_PARKING",
  "ENTRY_PERMISSION",
  "RESTRICTED_HOURS",
  "PETS_ON_SITE",
] as const;

export interface AccessConstraints {
  constraints: readonly AccessConstraint[];
  note: string;
}

/**
 * How the Customer would rather be reached.
 *
 * A preference, not a permission. Nothing here shares a phone number: the
 * number is disclosed by the server after acceptance, and this only says which
 * of the already-permitted channels to use first.
 */
export type CommunicationChannel = "CALL" | "WHATSAPP" | "IN_APP";

export interface PreferredCommunication {
  channel: CommunicationChannel;
}

export interface OptionalDetailValues {
  callback_preference: CallbackPreference;
  site_visit_interest: SiteVisitInterest;
  access_constraints: AccessConstraints;
  preferred_communication: PreferredCommunication;
}

/**
 * The state of an untouched panel.
 *
 * `ANY` and `CALL` are defaults in the weak sense — they are what the control
 * shows before anyone chooses — and `isOptionalDetailSet` below is what decides
 * whether the Customer actually expressed anything. A default must never reach
 * the server as though it were an answer.
 */
export const OPTIONAL_DETAIL_DEFAULTS: OptionalDetailValues = {
  callback_preference: { requested: false, window: "ANY" },
  site_visit_interest: { requested: false, note: "" },
  access_constraints: { constraints: [], note: "" },
  preferred_communication: { channel: "CALL" },
};

/** Cap on every free-text note here. Long enough for a paragraph, short enough to read. */
export const OPTIONAL_NOTE_MAX = 400;

/* --------------------------------------------------------------------------
   Reading the bag
   -------------------------------------------------------------------------- */

/**
 * Why every read is normalised.
 *
 * `RequirementDraftState.optionalDetails` is `Record<string, unknown>` and it
 * round-trips through `sessionStorage`, so what comes back is whatever was in
 * storage — a value from an older build, a hand-edited entry, a half-written
 * object. Trusting a cast there would put an `undefined` into a control's
 * `value` and turn it uncontrolled on the first keystroke.
 *
 * Anything unrecognised falls back to the default field by field rather than
 * discarding the whole value, so one bad key does not lose the rest.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNote(value: unknown): string {
  return typeof value === "string" ? value.slice(0, OPTIONAL_NOTE_MAX) : "";
}

const CALLBACK_WINDOWS: readonly CallbackWindow[] = ["MORNING", "AFTERNOON", "EVENING", "ANY"];
const CHANNELS: readonly CommunicationChannel[] = ["CALL", "WHATSAPP", "IN_APP"];

export function isCallbackWindow(value: unknown): value is CallbackWindow {
  return typeof value === "string" && CALLBACK_WINDOWS.includes(value as CallbackWindow);
}

export function isAccessConstraint(value: unknown): value is AccessConstraint {
  return typeof value === "string" && ACCESS_CONSTRAINTS.includes(value as AccessConstraint);
}

export function isCommunicationChannel(value: unknown): value is CommunicationChannel {
  return typeof value === "string" && CHANNELS.includes(value as CommunicationChannel);
}

const NORMALISERS: {
  [K in OptionalDetail]: (raw: unknown) => OptionalDetailValues[K];
} = {
  callback_preference: (raw) => {
    const fallback = OPTIONAL_DETAIL_DEFAULTS.callback_preference;
    if (!isRecord(raw)) return fallback;
    return {
      requested: asBoolean(raw.requested, fallback.requested),
      window: isCallbackWindow(raw.window) ? raw.window : fallback.window,
    };
  },

  site_visit_interest: (raw) => {
    const fallback = OPTIONAL_DETAIL_DEFAULTS.site_visit_interest;
    if (!isRecord(raw)) return fallback;
    return {
      requested: asBoolean(raw.requested, fallback.requested),
      note: asNote(raw.note),
    };
  },

  access_constraints: (raw) => {
    const fallback = OPTIONAL_DETAIL_DEFAULTS.access_constraints;
    if (!isRecord(raw)) return fallback;
    const constraints = Array.isArray(raw.constraints)
      ? raw.constraints.filter(isAccessConstraint)
      : fallback.constraints;
    // Deduplicated, because a repeated code would render the same checkbox row
    // twice and read as two different constraints.
    return {
      constraints: [...new Set(constraints)],
      note: asNote(raw.note),
    };
  },

  preferred_communication: (raw) => {
    const fallback = OPTIONAL_DETAIL_DEFAULTS.preferred_communication;
    if (!isRecord(raw)) return fallback;
    return {
      channel: isCommunicationChannel(raw.channel) ? raw.channel : fallback.channel,
    };
  },
};

/** The stored value for one panel, always a usable object. */
export function readOptionalDetail<K extends OptionalDetail>(
  bag: Readonly<Record<string, unknown>>,
  key: K,
): OptionalDetailValues[K] {
  return NORMALISERS[key](bag[key]);
}

/**
 * Whether the Customer actually expressed something here.
 *
 * Drives the summary on the review screen, and it is deliberately stricter than
 * "the key exists": opening a panel and closing it again writes a default, and a
 * default reported back as "Morning" would be the screen telling the Customer
 * they asked for a call they never asked for.
 */
export function isOptionalDetailSet(
  bag: Readonly<Record<string, unknown>>,
  key: OptionalDetail,
): boolean {
  switch (key) {
    case "callback_preference":
      return readOptionalDetail(bag, "callback_preference").requested;
    case "site_visit_interest": {
      const value = readOptionalDetail(bag, "site_visit_interest");
      return value.requested || value.note.trim().length > 0;
    }
    case "access_constraints": {
      const value = readOptionalDetail(bag, "access_constraints");
      return value.constraints.length > 0 || value.note.trim().length > 0;
    }
    case "preferred_communication":
      // A channel is only an expressed preference once it differs from the one
      // the control opened on. There is no "unset" channel to store instead —
      // a radio group with nothing selected is a worse control than a default.
      return (
        readOptionalDetail(bag, "preferred_communication").channel !==
        OPTIONAL_DETAIL_DEFAULTS.preferred_communication.channel
      );
    default:
      return false;
  }
}

/* --------------------------------------------------------------------------
   Validation
   -------------------------------------------------------------------------- */

/**
 * What is wrong with a panel, as a code.
 *
 * Same convention as `BlockReason`: the rule is testable here and the wording
 * lives beside the control it explains.
 *
 * Only one rule, and it earns its place. Saying "entry is restricted to certain
 * hours" without saying *which* hours is worse than saying nothing: a vendor
 * prices a constraint they cannot plan around, then arrives outside it. Every
 * other field here is genuinely optional and is left alone.
 */
export type OptionalDetailIssue = "RESTRICTED_HOURS_NEED_DETAIL";

export function validateOptionalDetail(
  bag: Readonly<Record<string, unknown>>,
  key: OptionalDetail,
): OptionalDetailIssue | null {
  if (key !== "access_constraints") return null;
  const value = readOptionalDetail(bag, "access_constraints");
  if (value.constraints.includes("RESTRICTED_HOURS") && value.note.trim().length === 0) {
    return "RESTRICTED_HOURS_NEED_DETAIL";
  }
  return null;
}

/**
 * The first panel with a problem, or null.
 *
 * Read by the submit guard on review. An optional extra blocking submission
 * looks contradictory until you notice what it means: nobody is blocked for
 * leaving a panel alone, only for opening one and leaving it half-said. Sending
 * a half-said constraint is the failure — it reaches the vendor as though it
 * were complete.
 */
export function firstInvalidOptionalDetail(
  bag: Readonly<Record<string, unknown>>,
): OptionalDetail | null {
  return OPTIONAL_DETAILS.find((key) => validateOptionalDetail(bag, key) !== null) ?? null;
}
