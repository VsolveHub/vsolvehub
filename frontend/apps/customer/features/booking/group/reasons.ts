/**
 * Customer-facing wording for the reason codes Django attaches to plans, units
 * and planning failures.
 *
 * ## Why there is a table at all
 *
 * The planner explains itself in codes — `independent_visits_safe_default`,
 * `no_eligible_capacity` — and a customer cannot read those. The table is
 * presentation for a decision the server already made; it never adds a reason,
 * removes one, or reorders them.
 *
 * ## Why the fallback shows the raw code
 *
 * `decisive_reasons`, `reason_codes` and `item_failures[].reason` are typed
 * `unknown` in the published contract, so the client cannot know the closed set. An
 * unmapped code is therefore surfaced verbatim rather than dropped or replaced
 * with a generic sentence: a code nobody has seen before is still the server's
 * answer, and hiding it would leave the customer with a plan that has no stated
 * reason at all. This is the same rule the shared error table follows — map what
 * the backend emits, degrade honestly for the rest.
 *
 * Publishing these as enumerated values would let an unmapped code be a compile
 * error instead of a paragraph of English. No proposal asks for that yet, and
 * this note is not a claim that one exists — the fallback above is what the
 * client relies on, and it is correct either way.
 */

import { describeError } from "@vsolve/query";

import {
  cartVersionConflict,
  isCartItemNotFound,
  isCommandInFlight,
  isIdempotencyKeyReused,
  isPlanStale,
  isQuoteExpired,
} from "./conflicts";

/** Reasons the planner gives for a whole alternative. */
const PLAN_REASONS: Record<string, string> = {
  compatible_same_partner_sequential:
    "One professional can safely do all of this in a single visit.",
  explicit_parallel_compatibility:
    "These jobs are approved to run at the same time by separate professionals.",
  compatible_lines_grouped: "Some jobs can share a visit.",
  visits_separated: "The rest need visits of their own.",
  independent_visits_safe_default:
    "Each job gets its own visit, which is always safe to schedule.",
};

/** Reasons the planner gives for one item it could not place. */
const ITEM_FAILURE_REASONS: Record<string, string> = {
  not_serviceable: "We do not cover this address for this job yet.",
  different_service_area: "This job is served by a different area from the rest of your cart.",
  dependency_cycle: "These jobs each need to happen before the other, so no order works.",
  no_eligible_capacity: "No professional is available for this job at the time you asked for.",
};

/**
 * Turns an unmapped code into something a person can read.
 *
 * Deliberately mechanical: it de-snake-cases and nothing more. Inventing a
 * sentence for a code whose meaning is unknown would be worse than showing the
 * code, because it would read as an explanation the server never gave.
 */
function humanise(code: string): string {
  const words = code.replace(/[_-]+/g, " ").trim();
  if (words.length === 0) return code;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Narrows an `unknown` reason field to the string codes it actually carries. */
export function readReasonCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

export function describePlanReason(code: string): string {
  return PLAN_REASONS[code] ?? humanise(code);
}

export function describeItemFailure(code: string | null): string {
  if (code === null) return "The server did not give a reason for this one.";
  return ITEM_FAILURE_REASONS[code] ?? humanise(code);
}

/**
 * Unit reason codes, minus the positional marker.
 *
 * The server prefixes each unit's codes with `unit_<position>`, which identifies
 * the unit rather than explaining it. The position is already rendered as the
 * visit number, so repeating it as prose would be noise.
 */
export function describeUnitReasons(value: unknown): string[] {
  return readReasonCodes(value)
    .filter((code) => !/^unit_\d+$/.test(code))
    .map(describePlanReason);
}

/** Plan-level reasons, in the order the server ranked them. */
export function describePlanReasons(value: unknown): string[] {
  return readReasonCodes(value).map(describePlanReason);
}

/** A refusal the customer is shown, and where the message belongs. */
export interface RemovalFailure {
  message: string;
  /**
   * True when pressing the same button again is a sensible next step.
   *
   * This is what decides *where* the message goes, and the placement matters
   * more than the wording. A refusal that can be retried belongs inside the
   * confirmation dialog the customer is still looking at — a native modal makes
   * the page behind it inert, so a message rendered out there is both invisible
   * and unreachable by a screen reader. A refusal that cannot be retried belongs
   * beside the reloaded cart, because the reloaded cart is the thing the
   * customer now has to look at.
   */
  retryable: boolean;
}

/**
 * What a refused cart-item removal means, in the customer's terms.
 *
 * The two non-retryable cases are both answered by the cart re-read that the
 * mutation itself triggers, and neither is a failure the customer caused. An
 * already-gone item in particular is the outcome they asked for; styling it as
 * an error they can fix would invite them to press Remove on a row that no
 * longer exists.
 */
export function describeRemovalFailure(error: unknown): RemovalFailure {
  if (cartVersionConflict(error) !== null) {
    return {
      message:
        "Your booking changed somewhere else, so that removal was not applied. We have " +
        "reloaded it — check what is there and try again.",
      retryable: false,
    };
  }
  if (isCartItemNotFound(error)) {
    return {
      message: "That service is already gone from this booking. We have reloaded what is left.",
      retryable: false,
    };
  }
  return { message: describeError(error, "mutation").message, retryable: true };
}

/**
 * What a refused pricing means, in the customer's terms.
 *
 * `fulfilment_plan_stale` is separated from every other refusal because the
 * recovery differs in kind: the whole set was worked out against inputs that
 * have moved on, so no *other* plan in it is any better. Telling the customer to
 * "try again" would send them back to a list where every option is equally dead.
 */
export function describeQuoteFailure(error: unknown): string {
  if (isPlanStale(error)) {
    return (
      "Those options were worked out before your booking changed, so we could not price " +
      "them. We have taken you back to pick a time again — nothing has been booked or charged."
    );
  }
  return describeError(error, "mutation").message;
}

/**
 * What a refused confirmation means, in the customer's terms.
 *
 * The two idempotency refusals are kept apart on purpose, because the safe
 * instruction is opposite in each case.
 *
 *  - `idempotency_in_progress` means the original command is still running.
 *    The only safe advice is to wait: pressing Confirm again is how one intent
 *    becomes two bookings, and this is exactly the moment a customer is most
 *    inclined to press it.
 *  - `idempotency_key_reused` means a key outlived the intent it was minted for.
 *    That is a client bug, and it is surfaced as one rather than papered over
 *    with a fresh key — which would convert a caught mistake into a duplicated
 *    command.
 *
 * An expired quote is not a failed confirmation at all. It is a price that
 * stopped applying, so the copy says nothing was booked rather than implying
 * something went wrong with the booking.
 */
export function describeConfirmFailure(error: unknown): string {
  if (isCommandInFlight(error)) {
    return (
      "We are still finishing your last confirmation. Nothing has been lost — wait a " +
      "moment and reload this page rather than confirming again."
    );
  }
  if (isIdempotencyKeyReused(error)) {
    return (
      "Your booking changed after you pressed Confirm, so we did not send it. Go back to " +
      "your booking and start the confirmation again."
    );
  }
  if (isQuoteExpired(error)) {
    return "This price expired before it was confirmed. Nothing has been booked or charged.";
  }
  return describeError(error, "financial").message;
}
