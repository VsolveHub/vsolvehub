"use client";

import { ApiRequestError, getStableIdempotencyKey, request, type Schemas } from "@vsolve/api-client";
import { useMutation } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * Starting a checkout on a Customer's behalf.
 *
 * This is the most consequential command in the console: it commits somebody
 * else to a purchase they are not at the keyboard for. Three things follow.
 *
 * ## The consent receipt is part of the command, not a checkbox
 *
 * Django stores `consent_purpose` and `consent_version` on the Checkout, and
 * they are what makes an assisted purchase distinguishable from a Customer's own
 * afterwards. The operator names the consent they actually took — nothing here
 * defaults them, because a default would be the console asserting a consent
 * nobody recorded.
 *
 * ## One key per Customer and quote, and it is never cleared
 *
 * A double-click, a lost response or a refresh mid-request must not become two
 * checkouts against one quote. The key is minted once for the pair and reused,
 * so a repeat replays the original outcome rather than creating a second one.
 * `clearIdempotencyKey` is deliberately not called on success: "terminal" for a
 * financial command means the operator should get the same answer back, not a
 * licence to make another.
 *
 * ## There is no read here
 *
 * The contract publishes no Operations lookup for Customers or quotes, so this
 * takes the ids the operator already holds from the case they are working. It
 * does not offer search, and it does not display anything about the Customer it
 * was not given.
 */

export interface AssistedCheckoutInput {
  customerId: string;
  quoteId: string;
  /** The consent purpose recorded when the Customer agreed, e.g. `assisted-booking`. */
  consentPurpose: string;
  /** The version of the consent document they were read. */
  consentVersion: string;
}

/** One stable key for one Customer-and-quote checkout, for the life of the session. */
export function assistedCheckoutIntentKey(input: {
  customerId: string;
  quoteId: string;
}): string {
  return getStableIdempotencyKey(
    `assisted-checkout:${input.customerId.trim()}:${input.quoteId.trim()}`,
  );
}

/**
 * Why the console does not say whether a checkout was created or replayed.
 *
 * Django sets `Idempotent-Replay: true` when it returns an earlier outcome
 * instead of acting again, and that would be worth showing. It cannot be:
 * `CORS_EXPOSE_HEADERS` publishes `Date` alone (`config/settings/base.py`), so a
 * browser on the admin origin reads `null` for that header on every call.
 *
 * Reading it anyway would produce a value that is always "not a replay",
 * including on the replays — a fabricated claim about somebody's money, and an
 * invisible one. So the surface states what now exists for the quote and does
 * not assert which call brought it about. Exposing the header is a settings
 * change, not a client one; when it lands, this becomes a real distinction.
 */

export function useCreateAssistedCheckout() {
  return useMutation({
    mutationFn: async (input: AssistedCheckoutInput): Promise<Schemas["Checkout"]> =>
      request(() =>
        getApiClient().POST("/api/v1/operations/assisted-checkouts/", {
          params: {
            header: {
              "Idempotency-Key": assistedCheckoutIntentKey(input),
            },
          },
          body: {
            customer_id: input.customerId.trim(),
            quote_id: input.quoteId.trim(),
            consent_purpose: input.consentPurpose.trim(),
            consent_version: input.consentVersion.trim(),
          },
        }),
      ),
    // Never retried automatically. A retry under the same key is safe on the
    // server, but an automatic one hides from the operator that the first
    // attempt's outcome was never seen.
    retry: false,
  });
}

/** The Customer or the quote is not one this operator may act on. */
export function isUnknownSubject(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

/** The key was reused with a different payload — two different commands, one key. */
export function isKeyReused(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "idempotency_key_reused";
}

/** An identical command is still running; the outcome is not known yet. */
export function isInProgress(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "idempotency_in_progress";
}
