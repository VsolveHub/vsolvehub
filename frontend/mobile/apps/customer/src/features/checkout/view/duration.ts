/**
 * How long a visit takes, in the form a customer reads before booking.
 * Ported from frontend/apps/customer/features/checkout/view/duration.ts
 */
export function formatServiceDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest} min${rest === 1 ? "" : "s"}`;
  const hourPart = `${hours} hr${hours === 1 ? "" : "s"}`;
  return rest === 0 ? hourPart : `${hourPart} & ${rest} min${rest === 1 ? "" : "s"}`;
}

