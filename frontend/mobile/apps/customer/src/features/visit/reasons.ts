// Ported from frontend/apps/customer/features/visit/reasons.ts
import { isApiRequestError } from "@vsolve/api-client";
import { describeError } from "@vsolve/query/native";

function errorCode(error: unknown): string | null {
  return isApiRequestError(error) ? error.code : null;
}

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
    return serverReason(error) ?? "This visit can no longer be rescheduled.";
  }
  if (code === "outside_serviceable_area") {
    return "That time cannot be served at this address. Your visit is unchanged.";
  }
  return describeError(error, "mutation").message;
}

