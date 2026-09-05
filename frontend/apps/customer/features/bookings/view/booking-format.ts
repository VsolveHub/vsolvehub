import type { Schemas } from "@vsolve/api-client";

import type { FulfilmentUnit } from "../queries";

/** Customer-facing date/time for a booking instant. */
export function formatBookingWhen(instant: string): string {
  return new Date(instant).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatBookingDate(instant: string): string {
  return new Date(instant).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function formatBookingTime(instant: string): string {
  return new Date(instant).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * How a fulfilment line is named on a payment summary.
 *
 * Amounts stay the server's. Only the customer-facing label is chosen here so a
 * SERVICE row can keep its real name while fee rows read as charges, not visits.
 */
export function linePresentationLabel(line: FulfilmentUnit["lines"][number]): string {
  const labels: Record<Schemas["QuoteLineKindEnum"], string | null> = {
    SERVICE: null,
    MINIMUM_VISIT_ADJUSTMENT: "Minimum visit charge",
    PLATFORM_FEE_ALLOCATION: "Platform fee",
  };
  return labels[line.kind] ?? line.label;
}

export function serviceLinesOf(unit: FulfilmentUnit): FulfilmentUnit["lines"] {
  return unit.lines.filter((line) => line.kind === "SERVICE");
}
