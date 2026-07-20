import type { CheckoutItemOutcome } from "./types";

export type AssignItemResult = {
  bookingRef: string;
  serviceName: string;
  assigned: boolean;
  partnerName?: string;
  refunded?: boolean;
};

export function cartTotalPaise(items: { quotedAmount: number }[]): number {
  return items.reduce((sum, i) => sum + i.quotedAmount, 0);
}

export function summarizeCheckout(results: AssignItemResult[]): CheckoutItemOutcome[] {
  return results.map((r) =>
    r.assigned
      ? { bookingRef: r.bookingRef, serviceName: r.serviceName, outcome: "assigned", partnerName: r.partnerName }
      : { bookingRef: r.bookingRef, serviceName: r.serviceName, outcome: "no_provider", refunded: r.refunded ?? false },
  );
}
