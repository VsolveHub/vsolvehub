import { getStableIdempotencyKey } from "@vsolve/api-client";

/**
 * Idempotency keys derived from the intent, not from the attempt.
 *
 * The published contract (1.10.0) requires `Idempotency-Key` on plan-set creation, plan-quote
 * creation and checkout. The header is only worth anything if the same customer
 * intent always produces the same key, so the key is derived from the inputs
 * that define the intent rather than minted at the call site.
 *
 * ## Why derivation replaces rotation
 *
 * A "materially new command" is, by construction, a different intent id, so it
 * gets a different key without anybody remembering to rotate one. Re-pressing
 * Confirm for the same quote reuses the key and replays the original result;
 * confirming a *different* quote cannot collide with it. That removes the two
 * ways manual rotation goes wrong — a key that outlives its intent (Django
 * answers `idempotency_key_reused`) and a key regenerated per render (which
 * defeats the header entirely).
 *
 * ## Why a successful key is not cleared
 *
 * The stored key *is* the duplicate-submit protection. After a checkout
 * succeeds, a customer who double-taps, refreshes into a resubmit, or reconnects
 * mid-request must reach the same Booking Group rather than a second one, and
 * that only happens if the same key is sent again. Keys live in `sessionStorage`
 * and are namespaced by intent, so nothing leaks into an unrelated intent later.
 *
 * Bodies must match the id exactly: every field in the request appears in the
 * id below, so a body change can never travel under an unchanged key.
 */

/**
 * Plan-set creation. Every field of the published request body is in the id.
 *
 * Since 1.18.0 that means **every** chosen start, not one. Two schedules over the
 * same cart and address are different intents — moving the salon appointment from
 * Friday to Saturday must produce a different plan set, not replay the Friday one
 * — so all of them are folded in. Sorting first keeps the key stable against the
 * order the rows happen to arrive in.
 */
export function planSetIntentKey(input: {
  cartVersion: number;
  addressId: string;
  preferredStarts: readonly { groupKey: string; startsAt: string }[];
}): string {
  const starts = input.preferredStarts
    .map((entry) => `${entry.groupKey}@${entry.startsAt}`)
    .sort()
    .join("|");
  return getStableIdempotencyKey(
    `plan-set:${input.cartVersion}:${input.addressId}:${starts}`,
  );
}

/** Quote creation for one immutable plan. */
export function planQuoteIntentKey(planId: string): string {
  return getStableIdempotencyKey(`plan-quote:${planId}`);
}

/** Checkout confirmation for one immutable quote. */
export function checkoutIntentKey(quoteId: string): string {
  return getStableIdempotencyKey(`checkout:${quoteId}`);
}
