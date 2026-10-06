// Ported from frontend/apps/customer/features/checkout/intents.ts
import { getStableIdempotencyKey } from "@vsolve/api-client";

export function planSetIntentKey(input: {
  cartVersion: number;
  addressId: string;
  preferredStarts: readonly { groupKey: string; startsAt: string }[];
}): string {
  const starts = input.preferredStarts
    .map((entry) => `${entry.groupKey}@${entry.startsAt}`)
    .sort()
    .join("|");
  return getStableIdempotencyKey(`plan-set:${input.cartVersion}:${input.addressId}:${starts}`);
}

export function planQuoteIntentKey(planId: string): string {
  return getStableIdempotencyKey(`plan-quote:${planId}`);
}

export function checkoutIntentKey(quoteId: string): string {
  return getStableIdempotencyKey(`checkout:${quoteId}`);
}
