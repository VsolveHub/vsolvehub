/**
 * How long a visit takes, in the form a customer reads before booking.
 *
 * Deliberately not `describeDuration` from `@vsolve/ui`: that one is phrased for
 * countdowns ("about 4 minutes remaining") because it exists to announce a
 * closing payment window. A visit length is a fact about the work, not time
 * running out, and reusing the countdown wording would tell someone their salon
 * appointment has "2 hours remaining" before it has started.
 *
 * The minutes come from the server's own estimate. Nothing here computes a
 * duration.
 */
export function formatServiceDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest} min${rest === 1 ? "" : "s"}`;
  const hourPart = `${hours} hr${hours === 1 ? "" : "s"}`;
  return rest === 0 ? hourPart : `${hourPart} & ${rest} min${rest === 1 ? "" : "s"}`;
}
