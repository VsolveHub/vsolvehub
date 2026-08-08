/**
 * Customer-facing wording for the refusals cancel and reschedule actually return.
 *
 * ## Why not just render `error.message`
 *
 * Because two of the four refusals are not written for a customer. `booking_command_invalid`
 * *is* — its detail is domain-authored copy Django publishes on purpose, and rewriting it here
 * would lose the specific reason (work already started, too close to the visit) in favour of a
 * vaguer one. The rest are not: `idempotency_key_reused` says "this idempotency key was already
 * used with a different request", which tells the customer nothing about their booking.
 *
 * So: pass through the one that was written for them, translate the ones that were not, and
 * fall back to the shared error table rather than inventing a third voice.
 *
 * ## Each message says what happened to the money
 *
 * Every path here ends with a booking that was either cancelled or not, and a customer whose
 * card was either touched or not. A message that leaves that open is the one thing this screen
 * cannot afford, because the next thing they do is either wait or book again.
 */

import { isApiRequestError } from "@vsolve/api-client";
import { describeError } from "@vsolve/query";

function errorCode(error: unknown): string | null {
  return isApiRequestError(error) ? error.code : null;
}

/** The domain-authored sentence Django wrote for this refusal, when it wrote one. */
function serverReason(error: unknown): string | null {
  if (!isApiRequestError(error)) return null;
  return error.message.trim().length > 0 ? error.message : null;
}

export function describeCancelFailure(error: unknown): string {
  const code = errorCode(error);

  if (code === "booking_version_conflict") {
    return (
      "This visit changed while you were deciding, so we did not cancel it. " +
      "Nothing has been charged or refunded — check the visit and try again."
    );
  }
  if (code === "booking_command_invalid") {
    return (
      serverReason(error) ??
      "This visit can no longer be cancelled. Nothing has been charged or refunded."
    );
  }
  if (code === "idempotency_key_reused") {
    return (
      "The visit moved after you opened this, so we did not reuse the earlier request. " +
      "Close this and try again — nothing has been cancelled or refunded."
    );
  }
  return describeError(error, "mutation").message;
}

export function describeRescheduleFailure(error: unknown): string {
  const code = errorCode(error);

  if (code === "partner_unavailable_for_window") {
    // The one refusal a customer can act on directly, and the grid is still open behind this
    // message — so it says which slot to change rather than just that something failed.
    return (
      "No professional can take that window. Your visit is unchanged and still booked for its " +
      "original time — pick another slot."
    );
  }
  if (code === "booking_version_conflict") {
    return (
      "This visit changed while you were picking a time, so we did not reschedule it. " +
      "Check the visit and try again."
    );
  }
  if (code === "booking_command_invalid") {
    // Covers both refusals worth reading in full: a visit that already started, and one too
    // close to its start for the free reschedule window.
    return serverReason(error) ?? "This visit can no longer be rescheduled.";
  }
  if (code === "outside_serviceable_area") {
    return "That time cannot be served at this address. Your visit is unchanged.";
  }
  return describeError(error, "mutation").message;
}
